import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client, type Credentials } from 'google-auth-library';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import type { CalendarClient } from './client.js';
import { createGoogleCalendarClient } from './googleClient.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

const PENDING_TTL_MS = 10 * 60 * 1000;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

export type StoredTokens = Credentials;

const secretsDir = (dataDir: string): string => join(dataDir, 'secrets');
const clientPath = (dataDir: string): string => join(secretsDir(dataDir), 'google-client.json');
const tokensPath = (dataDir: string): string => join(secretsDir(dataDir), 'google.json');

export function loadClientCredentials(dataDir: string): { clientId: string; clientSecret: string } | null {
  try {
    const json = JSON.parse(readFileSync(clientPath(dataDir), 'utf8')) as {
      installed?: { client_id?: string; client_secret?: string };
    };
    const { client_id, client_secret } = json.installed ?? {};
    if (!client_id || !client_secret) return null;
    return { clientId: client_id, clientSecret: client_secret };
  } catch {
    return null;
  }
}

/** null when no token file exists; throws when the file exists but cannot be parsed. */
export function readTokens(dataDir: string): StoredTokens | null {
  let raw: string;
  try {
    raw = readFileSync(tokensPath(dataDir), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    throw new Error('Google token file is corrupt');
  }
}

export function writeTokens(dataDir: string, t: StoredTokens): void {
  mkdirSync(secretsDir(dataDir), { recursive: true });
  const p = tokensPath(dataDir);
  const tmp = `${p}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(t), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, p);
}

export function deleteTokens(dataDir: string): void {
  rmSync(tokensPath(dataDir), { force: true });
}

export interface GoogleIntegration {
  isConfigured(): boolean;
  isConnected(): boolean;
  needsReconnect(): boolean;
  markNeedsReconnect(): void;
  client(): CalendarClient | null;
  beginAuth(host: string): Promise<string>;
  completeAuth(code: string, state: string): Promise<void>;
  disconnect(): Promise<void>;
}

interface Pending {
  verifier: string;
  redirectUri: string;
  expires: number;
}

export function createGoogleIntegration(config: AppConfig): GoogleIntegration {
  const dataDir = config.dataDir;
  const pending = new Map<string, Pending>();
  let reconnect = false;
  let cached: CalendarClient | null = null;
  let generation = 0;

  /** Token file state; a corrupt file counts as connected-but-needs-reconnect. */
  function tokenState(): { present: boolean; tokens: StoredTokens | null } {
    try {
      const tokens = readTokens(dataDir);
      return { present: tokens !== null, tokens };
    } catch (err) {
      console.error(`[google] ${(err as Error).message}; reconnect required`);
      reconnect = true;
      return { present: true, tokens: null };
    }
  }

  const creds = () => loadClientCredentials(dataDir);

  function buildClient(): CalendarClient | null {
    const c = creds();
    const tokens = tokenState().tokens;
    if (!c || !tokens) return null;
    const gen = generation;
    const auth = new OAuth2Client(c.clientId, c.clientSecret);
    auth.setCredentials(tokens);
    auth.on('tokens', (fresh) => {
      if (gen !== generation) return; // stale client after disconnect/reconnect
      const current = tokenState().tokens ?? {};
      writeTokens(dataDir, { ...current, ...fresh, refresh_token: fresh.refresh_token ?? current.refresh_token });
    });
    return createGoogleCalendarClient(auth);
  }

  return {
    isConfigured: () => creds() !== null,
    isConnected: () => tokenState().present,
    needsReconnect: () => reconnect,
    markNeedsReconnect: () => {
      reconnect = true;
    },
    client() {
      const st = tokenState();
      if (reconnect || !st.tokens) return null;
      cached ??= buildClient();
      return cached;
    },
    async beginAuth(host) {
      if (!LOOPBACK_HOST.test(host)) {
        throw new AppError('VALIDATION', 'Connect Google from the Mac (http://127.0.0.1:4280)');
      }
      const c = creds();
      if (!c) throw new AppError('VALIDATION', 'Google client file not found (secrets/google-client.json)');
      const redirectUri = `http://${host}/api/google/callback`;
      const oauth = new OAuth2Client(c.clientId, c.clientSecret, redirectUri);
      const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
      const now = Date.now();
      for (const [k, v] of pending) if (v.expires <= now) pending.delete(k);
      const state = randomBytes(24).toString('base64url');
      pending.set(state, { verifier: codeVerifier, redirectUri, expires: now + PENDING_TTL_MS });
      return oauth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
    },
    async completeAuth(code, state) {
      const p = pending.get(state);
      pending.delete(state);
      if (!p || p.expires <= Date.now()) throw new AppError('VALIDATION', 'Google sign-in expired. Try connecting again.');
      const c = creds();
      if (!c) throw new AppError('VALIDATION', 'Google client file not found (secrets/google-client.json)');
      const oauth = new OAuth2Client(c.clientId, c.clientSecret, p.redirectUri);
      let tokens: Credentials;
      try {
        ({ tokens } = await oauth.getToken({ code, codeVerifier: p.verifier }));
      } catch {
        throw new AppError('VALIDATION', 'Google rejected the authorization code. Try connecting again.');
      }
      const refresh = tokens.refresh_token ?? tokenState().tokens?.refresh_token;
      const granted = (tokens.scope ?? '').split(/\s+/);
      if (!refresh || !GOOGLE_SCOPES.every((sc) => granted.includes(sc))) {
        throw new AppError(
          'VALIDATION',
          "Google didn't grant offline access — please reconnect and allow all requested permissions",
        );
      }
      writeTokens(dataDir, { ...tokens, refresh_token: refresh });
      reconnect = false;
      generation++;
      cached = null;
    },
    async disconnect() {
      const c = creds();
      const tokens = tokenState().tokens;
      const token = tokens?.refresh_token ?? tokens?.access_token;
      if (c && token) {
        try {
          await new OAuth2Client(c.clientId, c.clientSecret).revokeToken(token);
        } catch {
          /* best effort */
        }
      }
      deleteTokens(dataDir);
      reconnect = false;
      generation++;
      cached = null;
    },
  };
}

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

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

export function readTokens(dataDir: string): StoredTokens | null {
  try {
    return JSON.parse(readFileSync(tokensPath(dataDir), 'utf8')) as StoredTokens;
  } catch {
    return null;
  }
}

export function writeTokens(dataDir: string, t: StoredTokens): void {
  mkdirSync(secretsDir(dataDir), { recursive: true });
  const p = tokensPath(dataDir);
  writeFileSync(p, JSON.stringify(t), { mode: 0o600 });
  chmodSync(p, 0o600);
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

function hostname(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0]!;
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

  const creds = () => loadClientCredentials(dataDir);

  function buildClient(): CalendarClient | null {
    const c = creds();
    const tokens = readTokens(dataDir);
    if (!c || !tokens) return null;
    const auth = new OAuth2Client(c.clientId, c.clientSecret);
    auth.setCredentials(tokens);
    auth.on('tokens', (fresh) => {
      const current = readTokens(dataDir) ?? {};
      writeTokens(dataDir, { ...current, ...fresh, refresh_token: fresh.refresh_token ?? current.refresh_token });
    });
    return createGoogleCalendarClient(auth);
  }

  return {
    isConfigured: () => creds() !== null,
    isConnected: () => readTokens(dataDir) !== null,
    needsReconnect: () => reconnect,
    markNeedsReconnect: () => {
      reconnect = true;
    },
    client() {
      if (reconnect || !readTokens(dataDir)) return null;
      cached ??= buildClient();
      return cached;
    },
    async beginAuth(host) {
      if (!LOOPBACK.has(hostname(host).toLowerCase())) {
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
      const previous = readTokens(dataDir);
      writeTokens(dataDir, { ...tokens, refresh_token: tokens.refresh_token ?? previous?.refresh_token });
      reconnect = false;
      cached = null;
    },
    async disconnect() {
      const c = creds();
      const tokens = readTokens(dataDir);
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
      cached = null;
    },
  };
}

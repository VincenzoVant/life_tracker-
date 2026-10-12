import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import {
  GOOGLE_SCOPES,
  createGoogleIntegration,
  deleteTokens,
  loadClientCredentials,
  readTokens,
  writeTokens,
} from '../../src/calendar/oauth.js';
import { createTestClient, createTestCtx } from '../helpers.js';
import { createFakeGoogle, FakeCalendarClient } from '../fakes/fakeCalendar.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lt-google-'));
});
afterEach(() => {
  vi.useRealTimers();
});

function writeClientFile(): void {
  mkdirSync(join(dir, 'secrets'), { recursive: true });
  writeFileSync(
    join(dir, 'secrets', 'google-client.json'),
    JSON.stringify({ installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'sek' } }),
  );
}

const integration = () => createGoogleIntegration({ ...loadConfig({ LT_DATA_DIR: dir } as NodeJS.ProcessEnv), port: 4280 });

describe('google oauth', () => {
  test('loadClientCredentials reads installed JSON; missing file → null', () => {
    expect(loadClientCredentials(dir)).toBeNull();
    writeClientFile();
    expect(loadClientCredentials(dir)).toEqual({ clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sek' });
  });

  test('writeTokens creates file with mode 0600; read/delete round-trip', () => {
    writeTokens(dir, { refresh_token: 'r', access_token: 'a' });
    const p = join(dir, 'secrets', 'google.json');
    expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(readTokens(dir)).toEqual({ refresh_token: 'r', access_token: 'a' });
    deleteTokens(dir);
    expect(readTokens(dir)).toBeNull();
  });

  test('isConfigured / isConnected / client() reflect files and needsReconnect', () => {
    const g = integration();
    expect([g.isConfigured(), g.isConnected(), g.client()]).toEqual([false, false, null]);
    writeClientFile();
    writeTokens(dir, { refresh_token: 'r' });
    expect([g.isConfigured(), g.isConnected()]).toEqual([true, true]);
    expect(g.client()).not.toBeNull();
    g.markNeedsReconnect();
    expect(g.needsReconnect()).toBe(true);
    expect(g.client()).toBeNull();
  });

  test('beginAuth on non-loopback host throws VALIDATION', async () => {
    writeClientFile();
    await expect(integration().beginAuth('192.168.1.5:4280')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(integration().beginAuth('life.example.com')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('beginAuth URL contains exact scopes, offline access, prompt consent, code_challenge, state', async () => {
    writeClientFile();
    const url = new URL(await integration().beginAuth('127.0.0.1:4280'));
    const q = url.searchParams;
    expect(q.get('scope')).toBe(GOOGLE_SCOPES.join(' '));
    expect(GOOGLE_SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
    expect(q.get('redirect_uri')).toBe('http://127.0.0.1:4280/api/google/callback');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('code_challenge')).toBeTruthy();
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('state')).toBeTruthy();
    expect(q.get('client_id')).toBe('cid.apps.googleusercontent.com');
  });

  test('beginAuth without client file → VALIDATION', async () => {
    await expect(integration().beginAuth('127.0.0.1:4280')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('completeAuth with unknown/expired state → VALIDATION', async () => {
    writeClientFile();
    const g = integration();
    await expect(g.completeAuth('code', 'nope')).rejects.toMatchObject({ code: 'VALIDATION' });

    vi.useFakeTimers();
    const state = new URL(await g.beginAuth('localhost:4280')).searchParams.get('state')!;
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await expect(g.completeAuth('code', state)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('beginAuth validates the whole Host (no suffix tricks)', async () => {
    writeClientFile();
    for (const h of ['127.0.0.1.evil.com', 'localhost:4280@evil.com', 'localhost:abc', '127.0.0.1:4280/x']) {
      await expect(integration().beginAuth(h)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    await expect(integration().beginAuth('[::1]:4280')).resolves.toContain('state=');
  });

  describe('completeAuth', () => {
    const fullScope = GOOGLE_SCOPES.join(' ');
    const stateOf = async (g: ReturnType<typeof integration>) =>
      new URL(await g.beginAuth('127.0.0.1:4280')).searchParams.get('state')!;

    test('happy path stores tokens, passes verifier, clears needsReconnect; replay rejected', async () => {
      writeClientFile();
      const spy = vi
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r', scope: fullScope }, res: null } as never);
      const g = integration();
      g.markNeedsReconnect();
      const state = await stateOf(g);
      await g.completeAuth('the-code', state);
      const arg = spy.mock.calls[0]![0] as { code: string; codeVerifier: string };
      expect(arg.code).toBe('the-code');
      expect(arg.codeVerifier).toBeTruthy();
      expect(readTokens(dir)).toMatchObject({ refresh_token: 'r', access_token: 'a' });
      expect(g.needsReconnect()).toBe(false);
      expect(g.client()).not.toBeNull();
      await expect(g.completeAuth('the-code', state)).rejects.toMatchObject({ code: 'VALIDATION' });
      spy.mockRestore();
    });

    test('missing refresh token or missing scope is rejected and nothing is stored', async () => {
      writeClientFile();
      const g = integration();
      const spy = vi
        .spyOn(OAuth2Client.prototype, 'getToken')
        .mockResolvedValueOnce({ tokens: { access_token: 'a', scope: fullScope }, res: null } as never)
        .mockResolvedValueOnce({
          tokens: { access_token: 'a', refresh_token: 'r', scope: GOOGLE_SCOPES.slice(0, 2).join(' ') },
          res: null,
        } as never);
      await expect(g.completeAuth('c', await stateOf(g))).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(g.completeAuth('c', await stateOf(g))).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(readTokens(dir)).toBeNull();
      spy.mockRestore();
    });

    test('disconnect deletes tokens', async () => {
      writeClientFile();
      writeTokens(dir, { refresh_token: 'r' });
      const spy = vi.spyOn(OAuth2Client.prototype, 'revokeToken').mockResolvedValue({} as never);
      const g = integration();
      await g.disconnect();
      expect(readTokens(dir)).toBeNull();
      expect(g.isConnected()).toBe(false);
      spy.mockRestore();
    });
  });

  test('corrupt token file → connected but needs reconnect; atomic write leaves no temp files', () => {
    writeClientFile();
    mkdirSync(join(dir, 'secrets'), { recursive: true });
    writeFileSync(join(dir, 'secrets', 'google.json'), '{not json');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = integration();
    expect(() => readTokens(dir)).toThrow();
    expect(g.isConnected()).toBe(true);
    expect(g.client()).toBeNull();
    expect(g.needsReconnect()).toBe(true);
    err.mockRestore();
    writeTokens(dir, { refresh_token: 'r' });
    expect(readdirSync(join(dir, 'secrets')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  test('GET /api/google/callback is exempt from the session check', async () => {
    const ctx = createTestCtx();
    ctx.google = createFakeGoogle(new FakeCalendarClient());
    const c = await createTestClient(ctx);
    const noCookie = await c.app.request('/api/health');
    expect(noCookie.status).toBe(200);
    // Unauthenticated: other API paths still require a session, the callback does not.
    const other = await c.app.request('/api/blocks');
    expect(other.status).toBe(401);
    const cb = await c.app.request('/api/google/callback?code=x&state=y');
    expect(cb.status).not.toBe(401);
  });
});

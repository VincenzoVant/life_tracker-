import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

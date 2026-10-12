import { expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestClient, createTestCtx, request } from './helpers.js';

const cookieOf = (res: { headers: Headers }): string => (res.headers.get('set-cookie') ?? '').split(';')[0]!;

test('protected route requires session', async () => {
  const app = createApp(createTestCtx());
  const res = await request(app, 'GET', '/api/settings');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('UNAUTHORIZED');
  expect((await request(app, 'GET', '/api/health')).status).toBe(200);
});

test('setup → status authenticated; second setup is 409', async () => {
  const app = createApp(createTestCtx());
  expect((await request(app, 'GET', '/api/auth/status')).body).toEqual({ pinSet: false, authenticated: false });
  const setup = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  expect(setup.status).toBe(200);
  const cookie = cookieOf(setup);
  expect(cookie).toMatch(/^lt_session=[0-9a-f]{64}$/);
  const status = await request(app, 'GET', '/api/auth/status', undefined, { Cookie: cookie });
  expect(status.body).toEqual({ pinSet: true, authenticated: true });
  expect((await request(app, 'GET', '/api/settings', undefined, { Cookie: cookie })).status).toBe(200);
  const again = await request(app, 'POST', '/api/auth/setup', { pin: '5678' });
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe('CONFLICT');
});

test('wrong pin 5x in 15 min locks out for 15 min even with right pin', async () => {
  const ctx = createTestCtx();
  const app = createApp(ctx);
  await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  for (let i = 0; i < 5; i++) expect((await request(app, 'POST', '/api/auth/login', { pin: '0000' })).status).toBe(401);
  const locked = await request(app, 'POST', '/api/auth/login', { pin: '1234' });
  expect(locked.status).toBe(429);
  expect(locked.body.error.code).toBe('LOCKED_OUT');
  ctx.clock.set('2026-10-14T19:15:01.000Z');
  expect((await request(app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(200);
});

test('failures older than 15 minutes do not count, and success resets', async () => {
  const ctx = createTestCtx();
  const app = createApp(ctx);
  await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  for (let i = 0; i < 4; i++) await request(app, 'POST', '/api/auth/login', { pin: '0000' });
  ctx.clock.set('2026-10-14T19:16:00.000Z');
  expect((await request(app, 'POST', '/api/auth/login', { pin: '0000' })).status).toBe(401); // 1st fresh failure
  expect((await request(app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(200); // not locked
  for (let i = 0; i < 4; i++) await request(app, 'POST', '/api/auth/login', { pin: '0000' });
  expect((await request(app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(200); // reset by success
});

test('cookie is not Secure on 127.0.0.1 but Secure on tailscale host', async () => {
  const ctx = createTestCtx({ config: loadConfig({ HOME: '/tmp/lt-test', LT_PUBLIC_ORIGIN: 'https://mac.tail1234.ts.net' } as NodeJS.ProcessEnv) });
  const app = createApp(ctx);
  await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  const local = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Host: '127.0.0.1:4280' });
  const setCookie = local.headers.get('set-cookie')!;
  expect(setCookie).not.toMatch(/Secure/);
  expect(setCookie).toMatch(/HttpOnly; .*SameSite=Strict/);
  expect(setCookie).toMatch(/Path=\//);
  expect(setCookie).toMatch(/Max-Age=2592000/);
  const ts = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Host: 'mac.tail1234.ts.net', Origin: 'https://mac.tail1234.ts.net' });
  expect(ts.headers.get('set-cookie')).toMatch(/Secure/);
});

test('mutating request with foreign or missing Origin is 403 FORBIDDEN_ORIGIN', async () => {
  const app = createApp(createTestCtx());
  const res = await request(app, 'POST', '/api/auth/login', { pin: '1234' }, { Origin: 'https://evil.example' });
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
  const missing = await app.request('/api/auth/login', { method: 'POST' });
  expect(missing.status).toBe(403);
  expect((await app.request('/api/auth/status')).status).toBe(200);
});

test('expired session is rejected', async () => {
  const client = await createTestClient();
  expect((await client.get('/api/settings')).status).toBe(200);
  client.ctx.clock.set('2026-11-14T19:00:01.000Z'); // > 30 days
  expect((await client.get('/api/settings')).status).toBe(401);
});

test('pin must be 4-8 digits', async () => {
  const app = createApp(createTestCtx());
  const res = await request(app, 'POST', '/api/auth/setup', { pin: '12a4' });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.pin).toBeDefined();
  expect((await request(app, 'POST', '/api/auth/setup', { pin: '123' })).status).toBe(400);
  expect((await request(app, 'POST', '/api/auth/setup', { pin: '123456789' })).status).toBe(400);
});

test('logout ends the session', async () => {
  const client = await createTestClient();
  expect((await client.post('/api/auth/logout')).status).toBe(200);
  expect((await client.get('/api/settings')).status).toBe(401);
});

test('change-pin requires session, checks current pin, ends other sessions', async () => {
  const client = await createTestClient();
  const other = await request(client.app, 'POST', '/api/auth/login', { pin: '1234' });
  const otherCookie = cookieOf(other);
  expect((await request(client.app, 'POST', '/api/auth/change-pin', { currentPin: '1234', newPin: '5678' })).status).toBe(401);
  expect((await client.post('/api/auth/change-pin', { currentPin: '9999', newPin: '5678' })).status).toBe(401);
  expect((await client.post('/api/auth/change-pin', { currentPin: '1234', newPin: '5678' })).status).toBe(200);
  expect((await client.get('/api/settings')).status).toBe(200); // new session issued
  expect((await request(client.app, 'GET', '/api/settings', undefined, { Cookie: otherCookie })).status).toBe(401);
  expect((await request(client.app, 'POST', '/api/auth/login', { pin: '1234' })).status).toBe(401);
  expect((await request(client.app, 'POST', '/api/auth/login', { pin: '5678' })).status).toBe(200);
});

test('concurrent wrong logins cannot bypass the lockout, and a late correct pin gets no session', async () => {
  const app = createApp(createTestCtx());
  await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  const wrong = Array.from({ length: 20 }, () => request(app, 'POST', '/api/auth/login', { pin: '0000' }));
  const right = request(app, 'POST', '/api/auth/login', { pin: '1234' });
  const results = await Promise.all([...wrong, right]);
  expect(results.slice(0, 20).filter((r) => r.status === 401)).toHaveLength(5);
  expect(results.slice(0, 20).filter((r) => r.status === 429)).toHaveLength(15);
  expect(results[20]!.status).toBe(429);
  expect(results[20]!.headers.get('set-cookie')).toBeNull();
});

const setupWith = (extra: Record<string, string>) =>
  createApp(createTestCtx()).request('/api/auth/setup', {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:4280', Host: '127.0.0.1:4280', 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify({ pin: '1234' }),
  });

test('cookie Secure when X-Forwarded-Proto https even on 127.0.0.1 host', async () => {
  const res = await setupWith({ 'X-Forwarded-Proto': 'https' });
  expect(res.headers.get('set-cookie')).toContain('; Secure');
});

test('cookie not Secure on loopback host without forwarded proto', async () => {
  const res = await setupWith({});
  expect(res.headers.get('set-cookie')).not.toContain('Secure');
});

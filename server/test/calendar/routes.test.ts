import { describe, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState, updateCalendarState } from '../../src/calendar/state.js';
import { googleChanges } from '../../src/db/schema.js';
import { createBlock } from '../../src/domains/blocks/service.js';
import { FakeCalendarClient, createFakeGoogle } from '../fakes/fakeCalendar.js';
import { createTestClient, createTestCtx, request } from '../helpers.js';

async function setup() {
  const c = await createTestClient();
  const fake = new FakeCalendarClient();
  c.ctx.google = createFakeGoogle(fake);
  await ensureCalendarSetup(c.ctx, fake);
  return { c, fake };
}

describe('google routes', () => {
  test('connect from loopback redirects to the consent URL', async () => {
    const { c } = await setup();
    const res = await c.get('/api/google/connect');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.test');
  });

  test('connect from non-loopback Host → 400 message mentions 127.0.0.1', async () => {
    const ctx = createTestCtx();
    const app = createApp(ctx);
    const setupRes = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
    const cookie = (setupRes.headers.get('set-cookie') ?? '').split(';')[0]!;
    // real integration: beginAuth rejects non-loopback hosts (no client file, so check the host first)
    const { createGoogleIntegration } = await import('../../src/calendar/oauth.js');
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'lt-routes-'));
    mkdirSync(join(dir, 'secrets'));
    writeFileSync(join(dir, 'secrets', 'google-client.json'), JSON.stringify({ installed: { client_id: 'id', client_secret: 's' } }));
    ctx.google = createGoogleIntegration({ ...ctx.config, dataDir: dir });
    const res = await request(app, 'GET', '/api/google/connect', undefined, { Cookie: cookie, Host: 'mac.tail1234.ts.net' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('127.0.0.1');
  });

  test('callback route works without session cookie but rejects bad state', async () => {
    const { c, fake } = await setup();
    const app = c.app;
    const bad = await app.request('/api/google/callback?code=abc&state=nope', { headers: {} });
    // no cookie → still reaches the handler (not a 401); the fake integration accepts any state
    expect(bad.status).toBe(302);
    expect(bad.headers.get('location')).toBe('/settings?google=connected');
    expect(fake.events(getCalendarState(c.ctx).lifeTrackerCalendarId!)).toEqual([]);

    c.ctx.google = {
      ...createFakeGoogle(fake),
      completeAuth: async () => {
        throw new Error('Google sign-in expired. Try connecting again.');
      },
    };
    const rejected = await app.request('/api/google/callback?code=abc&state=nope');
    expect(rejected.status).toBe(302);
    const loc = rejected.headers.get('location')!;
    expect(loc.startsWith('/settings?google=error&message=')).toBe(true);
    expect(decodeURIComponent(loc)).toContain('expired');
    const denied = await app.request('/api/google/callback?error=access_denied');
    expect(denied.headers.get('location')).toContain('google=error');
  });

  test('calendars lists selectable calendars (not the Life Tracker one)', async () => {
    const { c } = await setup();
    const res = await c.get('/api/google/calendars');
    expect(res.body).toEqual([{ id: 'primary', summary: 'Primary', primary: true, selected: true }]);
  });

  test('busy-calendars rejects unknown ids', async () => {
    const { c } = await setup();
    const lt = getCalendarState(c.ctx).lifeTrackerCalendarId!;
    for (const ids of [['nope'], ['primary', lt]]) {
      const res = await c.put('/api/google/busy-calendars', { calendarIds: ids, includeAllDay: false });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.calendarIds).toContain('Unknown calendar');
    }
    const ok = await c.put('/api/google/busy-calendars', { calendarIds: ['primary'], includeAllDay: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ busyCalendarIds: ['primary'], includeAllDay: true });
  });

  test('recreate-calendar and disconnect return status', async () => {
    const { c } = await setup();
    const old = getCalendarState(c.ctx).lifeTrackerCalendarId;
    updateCalendarState(c.ctx, { calendarMissing: true });
    const re = await c.post('/api/google/recreate-calendar');
    expect(re.status).toBe(200);
    expect(re.body.calendarId).not.toBe(old);
    expect((await c.post('/api/google/disconnect')).status).toBe(200);
  });

  test('changes list and mark seen', async () => {
    const { c } = await setup();
    const b = createBlock(c.ctx, { category: 'study', title: 'Moved one', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    c.ctx.db
      .insert(googleChanges)
      .values({ blockId: b.id, kind: 'moved', beforeStart: b.start, beforeEnd: b.end, afterStart: '2026-10-15T12:00:00.000Z', afterEnd: '2026-10-15T13:00:00.000Z', createdAt: '2026-10-14T19:00:00.000Z' })
      .run();
    const unseen = await c.get('/api/google/changes?unseen=true');
    expect(unseen.body).toMatchObject([{ blockId: b.id, kind: 'moved', title: 'Moved one', afterStart: '2026-10-15T12:00:00.000Z' }]);
    await c.post('/api/google/changes/seen', { ids: [unseen.body[0].id] });
    expect((await c.get('/api/google/changes?unseen=true')).body).toEqual([]);
    expect((await c.get('/api/google/changes')).body).toHaveLength(1);
  });

  test('google status reports the configured port', async () => {
    const { c } = await setup();
    const res = await c.get('/api/google/status');
    expect(res.body.port).toBe(c.ctx.config.port);
  });

  test('routes require a session', async () => {
    const { c } = await setup();
    const res = await c.app.request('/api/google/status');
    expect(res.status).toBe(401);
  });
});

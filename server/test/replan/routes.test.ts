import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createApp } from '../../src/app.js';
import { createBlock, getBlock, updateBlock } from '../../src/domains/blocks/service.js';
import type { ConflictRef, ConflictsPort } from '../../src/domains/replan/conflictsPort.js';
import { createCourse } from '../../src/domains/studies/service.js';
import { createTestClient, createTestCtx, request } from '../helpers.js';

const TZ = 'America/Los_Angeles';
const iso = (date: string, time: string): string => zonedToUtc(date, time, TZ).toISOString();
// Default test clock: Wed 2026-10-14 12:00 PDT.

async function setup(conflicts?: ConflictsPort) {
  const ctx = createTestCtx();
  const course = createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 360 });
  const study = (date: string, from: string, to: string): Block =>
    createBlock(ctx, { category: 'study', title: 'Study — Algebra', start: iso(date, from), end: iso(date, to), courseId: course.id });
  if (!conflicts) return { ctx, study, c: await createTestClient(ctx) };
  // createTestClient builds its own app; build one with the injected port and reuse its session.
  const app = createApp(ctx, { conflicts });
  const setupRes = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  const cookie = (setupRes.headers.get('set-cookie') ?? '').split(';')[0]!;
  const c = {
    get: (p: string) => request(app, 'GET', p, undefined, { Cookie: cookie }),
    post: (p: string, b?: unknown) => request(app, 'POST', p, b, { Cookie: cookie }),
  };
  return { ctx, study, c };
}

const drinks = (date = '2026-10-15') => ({
  title: 'Drinks',
  category: 'social',
  when: { start: iso(date, '18:00'), durationMinutes: 120 },
});

test('POST /api/quick-add with preset returns block and draft', async () => {
  const { ctx, study, c } = await setup();
  ctx.clock.set('2026-10-15T01:07:00.000Z'); // Wed 18:07 PDT
  const s = study('2026-10-14', '19:00', '21:00');
  const res = await c.post('/api/quick-add', { title: 'Beers', when: { preset: 'rest_of_tonight' } });
  expect(res.status).toBe(201);
  expect(res.body.block).toMatchObject({ title: 'Beers', category: 'social', source: 'quick_add', locked: true, status: 'committed' });
  expect(res.body.block.start).toBe(iso('2026-10-14', '18:15'));
  expect(res.body.draft.plan.mode).toBe('replan');
  expect(res.body.draft.changes.map((x: { blockId: string }) => x.blockId)).toContain(s.id);
  const got = await c.get(`/api/replan/${res.body.draft.plan.id}`);
  expect(got.status).toBe(200);
  expect(got.body.changes).toEqual(res.body.draft.changes);
});

test('POST /api/quick-add past bedtime → 400 fields.when', async () => {
  const { ctx, c } = await setup();
  ctx.clock.set('2026-10-15T06:45:00.000Z'); // Wed 23:45 PDT, after the 23:30 bedtime
  const res = await c.post('/api/quick-add', { title: 'Late', when: { preset: 'rest_of_tonight' } });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.when).toBe("It's already past your bedtime");
  const bad = await c.post('/api/quick-add', { title: '', when: { preset: 'all_day' } });
  expect(bad.status).toBe(400);
  expect(bad.body.error.fields.title).toBe('Title is required');
});

test('apply stale → 409 CONFLICT body with exact message', async () => {
  const { ctx, study, c } = await setup();
  study('2026-10-15', '18:30', '20:00');
  const other = study('2026-10-17', '10:00', '11:00');
  const res = await c.post('/api/quick-add', drinks());
  ctx.clock.set('2026-10-14T19:05:00.000Z');
  updateBlock(ctx, other.id, { title: 'Study — Algebra II' });
  const apply = await c.post(`/api/replan/${res.body.draft.plan.id}/apply`);
  expect(apply.status).toBe(409);
  expect(apply.body.error).toEqual({ code: 'CONFLICT', message: 'Your week changed since this replan — please replan again' });
});

test('apply and keep happy paths', async () => {
  const { ctx, study, c } = await setup();
  const s = study('2026-10-15', '18:30', '20:00');
  const first = await c.post('/api/quick-add', drinks());
  const applied = await c.post(`/api/replan/${first.body.draft.plan.id}/apply`);
  expect(applied.status).toBe(200);
  expect(applied.body.plan.status).toBe('applied');
  expect(getBlock(ctx, s.id).start).not.toBe(s.start);

  const s2 = study('2026-10-16', '18:30', '20:00');
  const second = await c.post('/api/quick-add', drinks('2026-10-16'));
  const kept = await c.post(`/api/replan/${second.body.draft.plan.id}/keep`);
  expect(kept.status).toBe(200);
  expect(kept.body.status).toBe('discarded');
  expect(getBlock(ctx, s2.id)).toEqual(s2);
});

test('GET replan for a full-mode plan → 404', async () => {
  const { c } = await setup();
  const full = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(full.status).toBe(201);
  const res = await c.get(`/api/replan/${full.body.plan.id}`);
  expect(res.status).toBe(404);
  expect((await c.get('/api/replan/nope')).status).toBe(404);
});

test('conflict replan returns draft', async () => {
  const conflict: ConflictRef = {
    id: 'c1', title: 'Dentist', start: iso('2026-10-15', '18:00'), end: iso('2026-10-15', '20:00'), status: 'open',
  };
  const calls: string[] = [];
  const port: ConflictsPort = {
    listConflicts: () => [conflict],
    dismissConflict: (_c, id) => void calls.push(`dismiss:${id}`),
    markConflictReplanned: (_c, id) => void calls.push(`replanned:${id}`),
  };
  const { study, c } = await setup(port);
  const s = study('2026-10-15', '18:30', '20:00');
  const res = await c.post('/api/conflicts/c1/replan');
  expect(res.status).toBe(201);
  expect(res.body.plan.summary.conflictId).toBe('c1');
  expect(res.body.changes.map((x: { blockId: string }) => x.blockId)).toContain(s.id);
  await c.post(`/api/replan/${res.body.plan.id}/apply`);
  expect(calls).toEqual(['replanned:c1']);

  const none = await c.post('/api/conflicts/c1/replan'); // block already moved: nothing to replan
  expect(none.status).toBe(200);
  expect(none.body).toEqual({ draft: null });
});

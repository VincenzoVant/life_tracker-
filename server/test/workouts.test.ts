import { expect, test } from 'vitest';
import { createBlock } from '../src/domains/blocks/service.js';
import { deleteSessionForBlock, listSessions, upsertSessionForBlock } from '../src/domains/workouts/service.js';
import { createTestClient } from './helpers.js';

test('cardio session returns pace', async () => {
  const c = await createTestClient();
  const r = await c.post('/api/workouts/sessions', { type: 'cardio', date: '2026-10-14', durationMinutes: 30, distanceKm: 5 });
  expect(r.status).toBe(201);
  expect(r.body.paceSecPerKm).toBe(360);
  const gym = await c.post('/api/workouts/sessions', { type: 'gym', date: '2026-10-14', durationMinutes: 60, distanceKm: 5 });
  expect(gym.body.paceSecPerKm).toBeNull();
  const list = await c.get('/api/workouts/sessions?from=2026-10-14&to=2026-10-14');
  expect(list.body).toHaveLength(2);
  const upd = await c.patch(`/api/workouts/sessions/${r.body.id}`, { durationMinutes: 25 });
  expect(upd.body.paceSecPerKm).toBe(300);
  expect((await c.del(`/api/workouts/sessions/${r.body.id}`)).status).toBe(200);
  expect((await c.patch(`/api/workouts/sessions/${r.body.id}`, {})).status).toBe(404);
});

test('upsertSessionForBlock keeps one session per block', async () => {
  const c = await createTestClient();
  const block = createBlock(c.ctx, {
    category: 'workout',
    title: 'Run',
    start: '2026-10-15T02:00:00.000Z', // 19:00 local on 10-14
    end: '2026-10-15T03:00:00.000Z',
    workoutType: 'cardio',
  });
  upsertSessionForBlock(c.ctx, block, 40, { distanceKm: 8 });
  const s = upsertSessionForBlock(c.ctx, block, 50, { distanceKm: 10, intensity: 4 });
  const rows = listSessions(c.ctx, { from: '2026-10-01', to: '2026-10-31' });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: s.id, blockId: block.id, type: 'cardio', date: '2026-10-14', durationMinutes: 50, distanceKm: 10, intensity: 4, paceSecPerKm: 300 });
  deleteSessionForBlock(c.ctx, block.id);
  expect(listSessions(c.ctx, { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(0);
});

test('lift summaries include PRs and last set', async () => {
  const c = await createTestClient();
  const lift = (await c.post('/api/lifts', { name: 'Bench' })).body;
  await c.post(`/api/lifts/${lift.id}/sets`, { date: '2026-09-01', weightKg: 100, reps: 3 });
  await c.post(`/api/lifts/${lift.id}/sets`, { date: '2026-09-08', weightKg: 105, reps: 1 });
  await c.post(`/api/lifts/${lift.id}/sets`, { weightKg: 90, reps: 8 });
  const [sum] = (await c.get('/api/lifts')).body;
  expect(sum.lift.name).toBe('Bench');
  expect(sum.prs.heaviest.weightKg).toBe(105);
  expect(sum.prs.bestE1rm.value).toBe(114);
  expect(sum.lastSet).toMatchObject({ weightKg: 90, date: '2026-10-14' });
  const hist = (await c.get(`/api/lifts/${lift.id}/sets`)).body;
  expect(hist.map((s: any) => s.weightKg)).toEqual([90, 105, 100]);
  expect((await c.patch(`/api/lifts/${lift.id}`, { name: 'Bench press' })).body.name).toBe('Bench press');
  expect((await c.del(`/api/lifts/${lift.id}/sets/${hist[0].id}`)).status).toBe(200);
});

test('delete lift with sets → 409; without sets → 200', async () => {
  const c = await createTestClient();
  const a = (await c.post('/api/lifts', { name: 'Squat' })).body;
  const b = (await c.post('/api/lifts', { name: 'Row' })).body;
  await c.post(`/api/lifts/${a.id}/sets`, { weightKg: 100, reps: 5 });
  const blocked = await c.del(`/api/lifts/${a.id}`);
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.code).toBe('CONFLICT');
  expect((await c.del(`/api/lifts/${b.id}`)).status).toBe(200);
  expect((await c.get('/api/lifts')).body).toHaveLength(1);
});

test('rejects reps 0 and weight 0', async () => {
  const c = await createTestClient();
  const lift = (await c.post('/api/lifts', { name: 'Deadlift' })).body;
  const r0 = await c.post(`/api/lifts/${lift.id}/sets`, { weightKg: 100, reps: 0 });
  expect(r0.status).toBe(400);
  expect(r0.body.error.fields.reps).toBeTruthy();
  const w0 = await c.post(`/api/lifts/${lift.id}/sets`, { weightKg: 0, reps: 5 });
  expect(w0.status).toBe(400);
  expect(w0.body.error.fields.weightKg).toBeTruthy();
  expect((await c.post('/api/workouts/sessions', { type: 'gym', date: '2026-10-14', durationMinutes: 0 })).status).toBe(400);
});

test('PATCH with null clears optional session fields', async () => {
  const c = await createTestClient();
  const r = await c.post('/api/workouts/sessions', {
    type: 'cardio', date: '2026-10-14', durationMinutes: 30, distanceKm: 5, intensity: 3, notes: 'easy', cardioKind: 'run',
  });
  const upd = await c.patch(`/api/workouts/sessions/${r.body.id}`, { intensity: null, notes: null, cardioKind: null, distanceKm: null });
  expect(upd.status).toBe(200);
  expect(upd.body).toMatchObject({ intensity: null, notes: null, cardioKind: null, distanceKm: null, paceSecPerKm: null, durationMinutes: 30 });
  const keep = await c.patch(`/api/workouts/sessions/${r.body.id}`, { durationMinutes: 40 });
  expect(keep.body.durationMinutes).toBe(40);
});

import { expect, test } from 'vitest';
import { createTestClient } from './helpers.js';

const full = {
  startupMinutes: 600,
  workoutsTotal: 4,
  workoutsByType: { gym: 3, cardio: 1, sport: null },
  freeEvenings: 2,
  dailyKcal: { target: 2400, tolerancePct: 15 },
  dailyProteinG: 150,
};

test('GoalSet round-trips and null removes a goal', async () => {
  const c = await createTestClient();
  const empty = await c.get('/api/goals');
  expect(empty.body).toEqual({
    startupMinutes: null,
    workoutsTotal: null,
    workoutsByType: { gym: null, cardio: null, sport: null },
    freeEvenings: null,
    dailyKcal: null,
    dailyProteinG: null,
  });
  const saved = await c.put('/api/goals', full);
  expect(saved.status).toBe(200);
  expect(saved.body).toEqual(full);
  expect((await c.get('/api/goals')).body).toEqual(full);
  // Replacing the whole set: null goals have no row any more.
  const next = await c.put('/api/goals', { ...full, startupMinutes: null, dailyKcal: null, workoutsByType: { gym: 2, cardio: null, sport: null } });
  expect(next.body).toMatchObject({ startupMinutes: null, dailyKcal: null, workoutsByType: { gym: 2, cardio: null, sport: null }, dailyProteinG: 150 });
  const rows = c.ctx.sqlite.prepare('select kind from goals order by kind').all() as Array<{ kind: string }>;
  expect(rows.map((r) => r.kind)).toEqual(['daily_protein_g', 'free_evenings', 'workouts_by_type', 'workouts_total']);
});

test('freeEvenings must be 0..7, dailyKcal tolerance defaults to 10', async () => {
  const c = await createTestClient();
  const bad = await c.put('/api/goals', { ...full, freeEvenings: 8 });
  expect(bad.status).toBe(400);
  expect(bad.body.error.code).toBe('VALIDATION');
  expect(bad.body.error.fields).toHaveProperty('freeEvenings');
  expect((await c.put('/api/goals', { ...full, freeEvenings: -1 })).status).toBe(400);
  expect((await c.put('/api/goals', { ...full, freeEvenings: 0 })).status).toBe(200);
  const r = await c.put('/api/goals', { dailyKcal: { target: 2200 } });
  expect(r.body.dailyKcal).toEqual({ target: 2200, tolerancePct: 10 });
  expect(r.body.freeEvenings).toBeNull();
});

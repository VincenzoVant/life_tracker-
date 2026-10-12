import { expect, test } from 'vitest';
import type { BlockCreateInput } from '@life-tracker/shared';
import { createBlock } from '../src/domains/blocks/service.js';
import { dailyReviews } from '../src/db/schema.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { getStreaks } from '../src/domains/goals/streaks.js';
import { createTestClient, createTestCtx } from './helpers.js';

// Today = Wed 2026-10-14 12:00 local (America/Los_Angeles); current week starts 2026-10-12.
const emptyGoals = {
  startupMinutes: null,
  workoutsTotal: null,
  workoutsByType: { gym: null, cardio: null, sport: null },
  freeEvenings: null,
  dailyKcal: null,
  dailyProteinG: null,
};
type TestCtx = ReturnType<typeof createTestCtx>;

const review = (ctx: TestCtx, date: string) =>
  ctx.db.insert(dailyReviews).values({ date, completedAt: '2026-10-14T00:00:00.000Z' }).run();

function workout(ctx: TestCtx, date: string, type: 'gym' | 'cardio' | 'sport') {
  const start = new Date(`${date}T18:00:00.000Z`);
  const end = new Date(start.getTime() + 3_600_000);
  createBlock(ctx, { title: 'w', category: 'workout', workoutType: type, start: start.toISOString(), end: end.toISOString() } as BlockCreateInput, {
    status: 'done',
    actualMinutes: 60,
    source: 'manual',
  });
}

test('reviewDays: reviewed Mon–Tue, today Wed not yet reviewed → 2; after reviewing Wed → 3', () => {
  const ctx = createTestCtx();
  review(ctx, '2026-10-12');
  review(ctx, '2026-10-13');
  expect(getStreaks(ctx).reviewDays).toBe(2);
  review(ctx, '2026-10-14');
  expect(getStreaks(ctx).reviewDays).toBe(3);
});

test('reviewDays gap resets', () => {
  const ctx = createTestCtx();
  review(ctx, '2026-10-10');
  review(ctx, '2026-10-12');
  review(ctx, '2026-10-13');
  expect(getStreaks(ctx).reviewDays).toBe(2);
  const empty = createTestCtx();
  review(empty, '2026-10-12'); // yesterday missing
  expect(getStreaks(empty).reviewDays).toBe(0);
});

test('workoutWeeks counts consecutive weeks meeting total and per-type goals; current week counted only when met', () => {
  const ctx = createTestCtx();
  saveGoals(ctx, { ...emptyGoals, workoutsTotal: 2, workoutsByType: { gym: 1, cardio: null, sport: null } });
  // Two previous weeks fully met; the week before that misses the gym goal.
  workout(ctx, '2026-10-06', 'cardio');
  workout(ctx, '2026-10-07', 'gym');
  workout(ctx, '2026-09-29', 'cardio');
  workout(ctx, '2026-09-30', 'gym');
  workout(ctx, '2026-09-22', 'cardio');
  workout(ctx, '2026-09-23', 'cardio');
  expect(getStreaks(ctx).workoutWeeks).toBe(2);
  workout(ctx, '2026-10-12', 'gym');
  expect(getStreaks(ctx).workoutWeeks).toBe(2); // current week not yet met
  workout(ctx, '2026-10-13', 'cardio');
  expect(getStreaks(ctx).workoutWeeks).toBe(3);
});

test('no workout goals → workoutWeeks 0', () => {
  const ctx = createTestCtx();
  workout(ctx, '2026-10-12', 'gym');
  expect(getStreaks(ctx).workoutWeeks).toBe(0);
});

test('GET /api/streaks', async () => {
  const c = await createTestClient();
  const res = await c.get('/api/streaks');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ reviewDays: 0, workoutWeeks: 0 });
});

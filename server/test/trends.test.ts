import { expect, test } from 'vitest';
import type { BlockCreateInput } from '@life-tracker/shared';
import { createBlock } from '../src/domains/blocks/service.js';
import { logMeal } from '../src/domains/food/service.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { getTrends } from '../src/domains/goals/trends.js';
import { createCourse } from '../src/domains/studies/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

// Today = Wed 2026-10-14 12:00 local (America/Los_Angeles, UTC-7); current week starts 2026-10-12.
const emptyGoals = {
  startupMinutes: null,
  workoutsTotal: null,
  workoutsByType: { gym: null, cardio: null, sport: null },
  freeEvenings: null,
  dailyKcal: null,
  dailyProteinG: null,
};

function study(ctx: ReturnType<typeof createTestCtx>, courseId: string, date: string, mins: number) {
  const start = new Date(`${date}T16:00:00.000Z`);
  const end = new Date(start.getTime() + mins * 60_000);
  createBlock(ctx, { title: 's', category: 'study', courseId, start: start.toISOString(), end: end.toISOString() } as BlockCreateInput, {
    status: 'done',
    actualMinutes: mins,
    source: 'manual',
  });
}

test('trends returns N weeks oldest→newest ending this week with summed study', () => {
  const ctx = createTestCtx();
  const a = createCourse(ctx, { name: 'A', color: '#3f51b5', weeklyGoalMinutes: 300 });
  const b = createCourse(ctx, { name: 'B', color: '#e91e63', weeklyGoalMinutes: 120 });
  study(ctx, a.id, '2026-10-13', 100);
  study(ctx, b.id, '2026-10-13', 50);
  study(ctx, a.id, '2026-10-06', 60);
  const t = getTrends(ctx, 4);
  expect(t.map((w) => w.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
  expect(t[3]!.studyMinutes).toEqual({ goal: 420, actual: 150 });
  expect(t[2]!.studyMinutes.actual).toBe(60);
  expect(getTrends(ctx, 12)).toHaveLength(12);
  expect(getTrends(ctx, 26)).toHaveLength(26);
});

test('study goal is null without course goals', () => {
  const ctx = createTestCtx();
  createCourse(ctx, { name: 'A', color: '#3f51b5', weeklyGoalMinutes: 0 });
  expect(getTrends(ctx, 4)[3]!.studyMinutes.goal).toBeNull();
});

test('avgKcal ignores days without logs and future days', () => {
  const ctx = createTestCtx();
  saveGoals(ctx, { ...emptyGoals, dailyKcal: { target: 2400, tolerancePct: 10 }, dailyProteinG: 150 });
  const log = (date: string, kcal: number, proteinG: number) => logMeal(ctx, { date, slot: 'lunch', freeText: 'x', kcal, proteinG });
  log('2026-10-12', 2000, 100);
  log('2026-10-13', 2400, 200);
  log('2026-10-17', 5000, 400); // future
  const w = getTrends(ctx, 4)[3]!;
  expect(w.avgKcal).toBe(2200);
  expect(w.avgProteinG).toBe(150);
  expect(w.daysKcalOk).toBe(1);
  expect(w.daysProteinOk).toBe(1);
  expect(getTrends(ctx, 4)[2]!.avgKcal).toBeNull();
});

test('weeks=5 → 400, weeks=12 → 200', async () => {
  const c = await createTestClient();
  expect((await c.get('/api/progress/trends?weeks=5')).status).toBe(400);
  expect((await c.get('/api/progress/trends')).status).toBe(400);
  const ok = await c.get('/api/progress/trends?weeks=12');
  expect(ok.status).toBe(200);
  expect(ok.body).toHaveLength(12);
});

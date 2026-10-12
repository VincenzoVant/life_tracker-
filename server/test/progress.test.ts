import { expect, test } from 'vitest';
import type { BlockCreateInput, BlockSource, BlockStatus } from '@life-tracker/shared';
import { createBlock } from '../src/domains/blocks/service.js';
import { getWeekProgress } from '../src/domains/goals/progress.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { archiveCourse, createCourse } from '../src/domains/studies/service.js';
import { createSession } from '../src/domains/workouts/service.js';
import { logMeal } from '../src/domains/food/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

// Week 2026-10-12 (Mon). America/Los_Angeles is UTC-7 all week, today = Wed 2026-10-14 12:00 local.
const WEEK = '2026-10-12';
const utc = (date: string, hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(h! + 7, m!);
  return d.toISOString();
};

function add(
  ctx: ReturnType<typeof createTestCtx>,
  input: Partial<BlockCreateInput> & { category: BlockCreateInput['category'] },
  date: string,
  from: string,
  mins: number,
  status: BlockStatus = 'committed',
  actual: number | null = null,
  source: BlockSource = 'manual',
) {
  const start = utc(date, from);
  const end = new Date(new Date(start).getTime() + mins * 60_000).toISOString();
  return createBlock(ctx, { title: 'b', ...input, start, end } as BlockCreateInput, { status, actualMinutes: actual, source });
}

const emptyGoals = {
  startupMinutes: null,
  workoutsTotal: null,
  workoutsByType: { gym: null, cardio: null, sport: null },
  freeEvenings: null,
  dailyKcal: null,
  dailyProteinG: null,
};

test('study planned vs actual per course', () => {
  const ctx = createTestCtx();
  const a = createCourse(ctx, { name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 360 });
  const study = { category: 'study' as const, courseId: a.id };
  add(ctx, study, '2026-10-12', '09:00', 120, 'done', 120);
  add(ctx, study, '2026-10-13', '09:00', 90, 'partial', 60);
  add(ctx, study, '2026-10-15', '09:00', 60, 'committed');
  add(ctx, study, '2026-10-16', '09:00', 60, 'skipped', 0);
  add(ctx, study, '2026-10-16', '12:00', 60, 'proposed');
  add(ctx, { category: 'study' }, '2026-10-16', '14:00', 60, 'committed'); // no course: excluded
  const p = getWeekProgress(ctx, WEEK);
  expect(p.study).toEqual([{ courseId: a.id, name: 'Algorithms', color: '#3f51b5', goal: 360, planned: 330, actual: 180 }]);
});

test('unplanned blocks count toward actual but not planned', () => {
  const ctx = createTestCtx();
  const a = createCourse(ctx, { name: 'A', color: '#3f51b5', weeklyGoalMinutes: 0 });
  add(ctx, { category: 'study', courseId: a.id }, '2026-10-12', '09:00', 60, 'done', 60);
  add(ctx, { category: 'study', courseId: a.id }, '2026-10-13', '09:00', 45, 'done', 45, 'unplanned');
  add(ctx, { category: 'startup' }, '2026-10-13', '12:00', 30, 'done', 30, 'unplanned');
  const p = getWeekProgress(ctx, WEEK);
  expect(p.study[0]).toMatchObject({ goal: null, planned: 60, actual: 105 });
  expect(p.startup).toMatchObject({ planned: 0, actual: 30 });
});

test('block 23:30-00:30 starting Sunday counts in this week, starting the next Monday does not', () => {
  const ctx = createTestCtx();
  add(ctx, { category: 'startup' }, '2026-10-18', '23:30', 60, 'done', 60);
  add(ctx, { category: 'startup' }, '2026-10-19', '00:15', 60, 'done', 60);
  const p = getWeekProgress(ctx, WEEK);
  expect(p.startup).toMatchObject({ planned: 60, actual: 60 });
  const next = getWeekProgress(ctx, '2026-10-19');
  expect(next.startup).toMatchObject({ planned: 60, actual: 60 });
});

test('fixed class blocks are excluded from study unless classesCountTowardStudy', () => {
  const ctx = createTestCtx();
  const a = createCourse(ctx, { name: 'A', color: '#3f51b5', weeklyGoalMinutes: 300 });
  add(ctx, { category: 'study', courseId: a.id }, '2026-10-12', '09:00', 60, 'done', 60);
  add(ctx, { category: 'study', courseId: a.id }, '2026-10-13', '10:00', 120, 'done', 120, 'fixed');
  expect(getWeekProgress(ctx, WEEK).study[0]).toMatchObject({ planned: 60, actual: 60 });
  expect(getWeekProgress(ctx, WEEK, { classesCountTowardStudy: true }).study[0]).toMatchObject({ planned: 180, actual: 180 });
});

test('workouts actual includes standalone sessions; byType split', () => {
  const ctx = createTestCtx();
  saveGoals(ctx, { ...emptyGoals, workoutsTotal: 4, workoutsByType: { gym: 3, cardio: null, sport: null } });
  add(ctx, { category: 'workout', workoutType: 'gym' }, '2026-10-12', '18:00', 60, 'done', 60);
  add(ctx, { category: 'workout', workoutType: 'gym' }, '2026-10-13', '18:00', 60, 'skipped', 0);
  add(ctx, { category: 'workout', workoutType: 'cardio' }, '2026-10-15', '18:00', 30, 'committed');
  createSession(ctx, { type: 'sport', date: '2026-10-14', durationMinutes: 60 }); // standalone
  const p = getWeekProgress(ctx, WEEK);
  expect(p.workouts.total).toEqual({ goal: 4, planned: 3, actual: 2 });
  expect(p.workouts.byType).toEqual({
    gym: { goal: 3, planned: 2, actual: 1 },
    cardio: { goal: null, planned: 1, actual: 0 },
    sport: { goal: null, planned: 0, actual: 1 },
  });
});

test('free evenings: work block 19:30 Tue makes Tue not free; social block does not', () => {
  const ctx = createTestCtx();
  add(ctx, { category: 'work' }, '2026-10-13', '19:30', 120, 'committed');
  add(ctx, { category: 'social' }, '2026-10-12', '19:00', 120, 'committed');
  add(ctx, { category: 'study' }, '2026-10-16', '18:00', 90, 'committed'); // ends 19:30, overlaps
  add(ctx, { category: 'study' }, '2026-10-17', '17:00', 120, 'committed'); // ends 19:00, no overlap
  add(ctx, { category: 'startup' }, '2026-10-18', '19:00', 60, 'skipped', 0); // skipped does not occupy
  const p = getWeekProgress(ctx, WEEK).freeEvenings;
  expect(p.planned).toBe(5);
  expect(p.actual).toBe(2);
  expect(p.freeDates).toEqual(['2026-10-12', '2026-10-14']);
  expect(getWeekProgress(ctx, WEEK, { eveningStart: '20:00' }).freeEvenings.planned).toBe(6);
});

test('nutrition ok flags with tolerance; future days null', () => {
  const ctx = createTestCtx();
  saveGoals(ctx, { ...emptyGoals, dailyKcal: { target: 2400, tolerancePct: 10 }, dailyProteinG: 150 });
  const log = (date: string, kcal: number, proteinG: number) =>
    logMeal(ctx, { date, slot: 'lunch', freeText: 'x', kcal, proteinG });
  log('2026-10-12', 2200, 160);
  log('2026-10-13', 2000, 100);
  log('2026-10-16', 2400, 200);
  const n = getWeekProgress(ctx, WEEK).nutrition;
  expect(n).toHaveLength(7);
  expect(n[0]).toMatchObject({ date: '2026-10-12', kcal: 2200, kcalTarget: 2400, proteinTarget: 150, kcalOk: true, proteinOk: true });
  expect(n[1]).toMatchObject({ kcalOk: false, proteinOk: false });
  expect(n[2]).toMatchObject({ kcal: 0, kcalOk: false, proteinOk: false }); // today, nothing logged
  expect(n[4]).toMatchObject({ date: '2026-10-16', kcal: 2400, kcalOk: null, proteinOk: null });
  const noGoal = createTestCtx();
  expect(getWeekProgress(noGoal, WEEK).nutrition[0]).toMatchObject({ kcalTarget: null, kcalOk: null, proteinOk: null });
});

test('archived course with activity this week still listed', () => {
  const ctx = createTestCtx();
  const a = createCourse(ctx, { name: 'Old', color: '#3f51b5', weeklyGoalMinutes: 120 });
  const b = createCourse(ctx, { name: 'Idle', color: '#d50000', weeklyGoalMinutes: 60 });
  const c = createCourse(ctx, { name: 'Gone', color: '#039be5', weeklyGoalMinutes: 60 });
  add(ctx, { category: 'study', courseId: a.id }, '2026-10-12', '09:00', 60, 'done', 60);
  archiveCourse(ctx, a.id);
  archiveCourse(ctx, c.id);
  const p = getWeekProgress(ctx, WEEK);
  expect(p.study.map((s) => s.name).sort()).toEqual(['Idle', 'Old']);
  expect(p.study.find((s) => s.courseId === a.id)).toMatchObject({ actual: 60 });
  expect(p.study.some((s) => s.courseId === b.id)).toBe(true);
});

test('weekStart that is not a Monday → 400', async () => {
  const c = await createTestClient();
  const bad = await c.get('/api/progress/week?weekStart=2026-10-13');
  expect(bad.status).toBe(400);
  expect(bad.body.error.code).toBe('VALIDATION');
  expect((await c.get('/api/progress/week')).status).toBe(400);
  const ok = await c.get(`/api/progress/week?weekStart=${WEEK}`);
  expect(ok.status).toBe(200);
  expect(ok.body.weekStart).toBe(WEEK);
  expect(ok.body.nutrition).toHaveLength(7);
});

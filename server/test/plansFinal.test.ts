import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createBlock, listBlocks } from '../src/domains/blocks/service.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { createCourse } from '../src/domains/studies/service.js';
import { createTask } from '../src/domains/startup/service.js';
import { buildPlannerInput } from '../src/domains/plans/inputs.js';
import { createSession } from '../src/domains/workouts/service.js';
import { createTestClient, type TestClient } from './helpers.js';

const TZ = 'America/Los_Angeles';
const iso = (date: string, time: string): string => zonedToUtc(date, time, TZ).toISOString();
const GOALS = {
  startupMinutes: 300,
  workoutsTotal: null,
  workoutsByType: { gym: 2, cardio: null, sport: null },
  freeEvenings: 2,
  dailyKcal: null,
  dailyProteinG: null,
};
// Default test clock: Wed 2026-10-14 12:00 PDT.

function seed(c: TestClient) {
  const course = createCourse(c.ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 360 });
  saveGoals(c.ctx, GOALS);
  createTask(c.ctx, { title: 'Landing page' });
  return course;
}

const all = (c: TestClient): Block[] =>
  listBlocks(c.ctx, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') });

test('A1: a replan draft does not leak into the weekly draft endpoints', async () => {
  const c = await createTestClient();
  const course = seed(c);
  createBlock(c.ctx, {
    category: 'study', title: 'Algebra', start: iso('2026-10-15', '18:00'), end: iso('2026-10-15', '19:00'), courseId: course.id,
  });
  const qa = await c.post('/api/quick-add', {
    title: 'Drinks', category: 'social', when: { start: iso('2026-10-15', '18:00'), durationMinutes: 120 },
  });
  expect(qa.body.draft).not.toBeNull();
  const id = qa.body.draft.plan.id as string;
  expect((await c.get('/api/plans/draft?weekStart=2026-10-12')).body).toBeNull();
  expect((await c.post(`/api/plans/${id}/commit`)).status).toBe(404);
  expect((await c.post(`/api/plans/${id}/discard`)).status).toBe(404);
  expect(
    (await c.post(`/api/plans/${id}/blocks`, {
      category: 'rest', title: 'Nap', start: iso('2026-10-16', '15:00'), end: iso('2026-10-16', '15:30'),
    })).status,
  ).toBe(404);
});

test('A2: quick-add over a proposed block removes it from the open draft, so commit does not stack it', async () => {
  const c = await createTestClient();
  seed(c);
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const target = (draft.body.blocks as Block[]).find((b) => b.category === 'study')!;
  const qa = await c.post('/api/quick-add', {
    title: 'Surprise', category: 'social', when: { start: target.start, durationMinutes: 60 },
  });
  expect(qa.status).toBe(201);
  const after = await c.get('/api/plans/draft?weekStart=2026-10-19');
  expect((after.body.blocks as Block[]).some((b) => b.id === target.id)).toBe(false);
  const res = await c.post(`/api/plans/${draft.body.plan.id}/commit`);
  expect(res.status).toBe(200);
  const stacked = all(c).filter(
    (b) =>
      b.id !== qa.body.block.id && b.status === 'committed' &&
      b.start < qa.body.block.end && b.end > qa.body.block.start,
  );
  expect(stacked).toHaveLength(0);
});

test('A2: commit skips proposed blocks overlapping committed blocks or new busy time', async () => {
  const c = await createTestClient();
  seed(c);
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const blocks = draft.body.blocks as Block[];
  const a = blocks.find((b) => b.category === 'study')!;
  const b2 = blocks.find((b) => b.category === 'startup' || b.category === 'workout')!;
  createBlock(c.ctx, { category: 'appointment', title: 'Doc', start: a.start, end: a.end });
  c.ctx.busy = { busyIntervals: () => [{ start: b2.start, end: b2.end, title: 'Late busy' }] };
  const res = await c.post(`/api/plans/${draft.body.plan.id}/commit`);
  expect(res.status).toBe(200);
  expect(res.body.skipped).toBeGreaterThanOrEqual(2);
  expect(res.body.status).toBe('applied');
  const ids = new Set(all(c).map((b) => b.id));
  expect(ids.has(a.id)).toBe(false);
  expect(ids.has(b2.id)).toBe(false);
});

test('A2: commit skips proposed blocks that start in the past', async () => {
  const c = await createTestClient();
  seed(c);
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const first = (draft.body.blocks as Block[])[0]!;
  c.ctx.clock.set(new Date(new Date(first.start).getTime() + 1).toISOString());
  const res = await c.post(`/api/plans/${draft.body.plan.id}/commit`);
  expect(res.status).toBe(200);
  expect(res.body.skipped).toBeGreaterThanOrEqual(1);
  expect(all(c).some((b) => b.id === first.id)).toBe(false);
});

const workoutGoals = (c: TestClient, weekStart: string) =>
  buildPlannerInput(c.ctx, weekStart).goals.filter((g) => g.kind === 'workout');

test('A5: workoutsTotal alone plans that many workouts (extra assigned to gym)', async () => {
  const c = await createTestClient();
  saveGoals(c.ctx, { ...GOALS, workoutsTotal: 4, workoutsByType: { gym: null, cardio: null, sport: null } });
  expect(workoutGoals(c, '2026-10-19')).toEqual([{ kind: 'workout', workoutType: 'gym', count: 4 }]);
});

test('A5: total above the per-type goals adds the difference to gym', async () => {
  const c = await createTestClient();
  saveGoals(c.ctx, { ...GOALS, workoutsTotal: 4, workoutsByType: { gym: 1, cardio: 1, sport: null } });
  const goals = workoutGoals(c, '2026-10-19');
  const count = (t: string) => goals.filter((g) => g.kind === 'workout' && g.workoutType === t).reduce((n, g) => n + (g.kind === 'workout' ? g.count : 0), 0);
  expect(count('gym')).toBe(3);
  expect(count('cardio')).toBe(1);
});

test('A5: standalone sessions in the week reduce the remaining workouts', async () => {
  const c = await createTestClient();
  saveGoals(c.ctx, { ...GOALS, workoutsTotal: 4, workoutsByType: { gym: null, cardio: null, sport: null } });
  createSession(c.ctx, { type: 'cardio', date: '2026-10-20', durationMinutes: 30 });
  expect(workoutGoals(c, '2026-10-19')).toEqual([{ kind: 'workout', workoutType: 'gym', count: 3 }]);
});

test('A5: a workoutsTotal-only goal produces workout blocks in the draft', async () => {
  const c = await createTestClient();
  saveGoals(c.ctx, { ...GOALS, workoutsTotal: 3, workoutsByType: { gym: null, cardio: null, sport: null } });
  const res = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect((res.body.blocks as Block[]).filter((b) => b.category === 'workout')).toHaveLength(3);
});

import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createBlock, listBlocks, setBlockStatus } from '../src/domains/blocks/service.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { buildPlannerInput } from '../src/domains/plans/inputs.js';
import { createCourse } from '../src/domains/studies/service.js';
import { createTask } from '../src/domains/startup/service.js';
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
const proposed = (c: TestClient): Block[] => all(c).filter((b) => b.status === 'proposed');

test('plan next week creates proposed planner blocks linked to plan with shortfalls', async () => {
  const c = await createTestClient();
  const course = seed(c);
  const res = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(res.status).toBe(201);
  const { plan, blocks } = res.body;
  expect(plan).toMatchObject({ weekStart: '2026-10-19', mode: 'full', status: 'draft', triggerBlockId: null });
  expect(plan.summary.shortfalls).toBeInstanceOf(Array);
  expect(plan.summary.reservedEvenings).toBeInstanceOf(Array);
  expect(blocks.length).toBeGreaterThan(0);
  for (const b of blocks as Block[]) {
    expect(b).toMatchObject({ status: 'proposed', source: 'planner', planId: plan.id });
  }
  expect(blocks.some((b: Block) => b.category === 'study' && b.courseId === course.id)).toBe(true);
  expect(blocks.some((b: Block) => b.category === 'meal')).toBe(true);
  const got = await c.get('/api/plans/draft?weekStart=2026-10-19');
  expect(got.body.plan.id).toBe(plan.id);
  expect(got.body.blocks).toHaveLength(blocks.length);
});

test('draft is null when there is none', async () => {
  const c = await createTestClient();
  const res = await c.get('/api/plans/draft?weekStart=2026-10-19');
  expect(res.status).toBe(200);
  expect(res.body).toBeNull();
});

test('planning again discards the previous draft: exactly one draft and no orphan proposed blocks', async () => {
  const c = await createTestClient();
  seed(c);
  const first = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const edited = first.body.blocks[0] as Block;
  const patch = await c.patch(`/api/blocks/${edited.id}`, { notes: 'edited' });
  expect(patch.status).toBe(200);
  const second = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(second.body.plan.id).not.toBe(first.body.plan.id);
  const props = proposed(c);
  expect(props).toHaveLength(second.body.blocks.length);
  expect(props.every((b) => b.planId === second.body.plan.id)).toBe(true);
  const rows = c.ctx.sqlite.prepare("select status from plans where week_start = '2026-10-19'").all() as { status: string }[];
  expect(rows.map((r) => r.status).sort()).toEqual(['discarded', 'draft']);
});

test('current week mid-day: no block before now (Wed 12:00 → ceil 12:00) and goals reduced by done+committed', async () => {
  const c = await createTestClient();
  const course = seed(c);
  const done = createBlock(c.ctx, {
    category: 'study', title: 'Algebra', start: iso('2026-10-12', '17:00'), end: iso('2026-10-12', '19:00'), courseId: course.id,
  });
  setBlockStatus(c.ctx, done.id, 'done');
  createBlock(c.ctx, {
    category: 'study', title: 'Algebra', start: iso('2026-10-15', '17:00'), end: iso('2026-10-15', '18:00'), courseId: course.id,
  });

  const input = buildPlannerInput(c.ctx, '2026-10-12');
  expect(input.range.start).toBe(zonedToUtc('2026-10-14', '12:00', TZ).getTime());
  expect(input.goals.find((g) => g.kind === 'study')).toMatchObject({ minutes: 180 });

  const res = await c.post('/api/plans', { weekStart: '2026-10-12' });
  expect(res.status).toBe(201);
  const nowMs = c.ctx.clock.now().getTime();
  for (const b of res.body.blocks as Block[]) expect(new Date(b.start).getTime()).toBeGreaterThanOrEqual(nowMs);
  const studyMin = (res.body.blocks as Block[])
    .filter((b) => b.category === 'study')
    .reduce((s, b) => s + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000, 0);
  expect(studyMin).toBeGreaterThan(0);
  expect(studyMin).toBeLessThanOrEqual(180);
});

test('past week → 400 fields.weekStart', async () => {
  const c = await createTestClient();
  const res = await c.post('/api/plans', { weekStart: '2026-10-05' });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.weekStart).toBe('Cannot plan a past week');
});

test('non-Monday weekStart → 400', async () => {
  const c = await createTestClient();
  const res = await c.post('/api/plans', { weekStart: '2026-10-20' });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.weekStart).toBe('Must be a Monday');
});

test('commit turns proposed into committed and plan applied; second commit → 409', async () => {
  const c = await createTestClient();
  seed(c);
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const res = await c.post(`/api/plans/${draft.body.plan.id}/commit`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('applied');
  const mine = all(c).filter((b) => b.planId === draft.body.plan.id);
  expect(mine).toHaveLength(draft.body.blocks.length);
  expect(mine.every((b) => b.status === 'committed')).toBe(true);
  expect((await c.post(`/api/plans/${draft.body.plan.id}/commit`)).status).toBe(409);
  expect((await c.get('/api/plans/draft?weekStart=2026-10-19')).body).toBeNull();
});

test('discard deletes proposed blocks', async () => {
  const c = await createTestClient();
  seed(c);
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const res = await c.post(`/api/plans/${draft.body.plan.id}/discard`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('discarded');
  expect(proposed(c)).toHaveLength(0);
  expect((await c.post(`/api/plans/${draft.body.plan.id}/discard`)).status).toBe(409);
});

test('manual block can be added to a draft only', async () => {
  const c = await createTestClient();
  const draft = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const body = { category: 'rest', title: 'Nap', start: iso('2026-10-20', '15:00'), end: iso('2026-10-20', '15:30') };
  const added = await c.post(`/api/plans/${draft.body.plan.id}/blocks`, body);
  expect(added.status).toBe(201);
  expect(added.body).toMatchObject({ status: 'proposed', source: 'manual', planId: draft.body.plan.id });
  await c.post(`/api/plans/${draft.body.plan.id}/discard`);
  expect((await c.post(`/api/plans/${draft.body.plan.id}/blocks`, body)).status).toBe(409);
  expect((await c.post('/api/plans/nope/commit')).status).toBe(404);
});

test('busy provider intervals are respected', async () => {
  const c = await createTestClient();
  seed(c);
  const busy = { start: iso('2026-10-20', '12:00'), end: iso('2026-10-20', '14:00'), title: 'Dentist' };
  c.ctx.busy = { busyIntervals: () => [busy] };
  const res = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(res.body.blocks.length).toBeGreaterThan(0);
  const s = new Date(busy.start).getTime();
  const e = new Date(busy.end).getTime();
  for (const b of res.body.blocks as Block[]) {
    expect(new Date(b.start).getTime() < e && new Date(b.end).getTime() > s).toBe(false);
  }
});

// 'draft blocks do not count in progress planned unless includeProposed' is deferred until the
// getWeekProgress `includeProposed` option (separate task) is merged.

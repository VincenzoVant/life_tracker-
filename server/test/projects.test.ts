import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { blocks } from '../src/db/schema.js';
import { createBlock, getBlock, setBlockStatus } from '../src/domains/blocks/service.js';
import { saveGoals } from '../src/domains/goals/service.js';
import { buildPlannerInput } from '../src/domains/plans/inputs.js';
import { createProject } from '../src/domains/projects/service.js';
import { applyReplan, quickAdd } from '../src/domains/replan/service.js';
import { createCourse } from '../src/domains/studies/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

const iso = (date: string, time: string): string => zonedToUtc(date, time, 'America/Los_Angeles').toISOString();

// Clock: Wed 2026-10-14 12:00 in Los Angeles; this week starts Mon 2026-10-12.
const WEEK = '2026-10-12';
const NEXT = '2026-10-19';
const fun = { title: 'Guitar', kind: 'fun', weeklyMinutes: 120 };

test('create with defaults, list for a week, update and delete', async () => {
  const c = await createTestClient();
  const created = await c.post('/api/projects', fun);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({
    ...fun, courseId: null, weekStart: null, windows: [], blockMin: 60, blockMax: 120, priority: 2, active: true,
  });
  const list = await c.get(`/api/projects?weekStart=${WEEK}`);
  expect(list.status).toBe(200);
  expect(list.body).toEqual([{ ...created.body, plannedMinutes: 0, doneMinutes: 0 }]);

  const windows = [{ days: [6, 7], start: '10:00', end: '13:00' }];
  const upd = await c.patch(`/api/projects/${created.body.id}`, { weeklyMinutes: 180, windows, priority: 1 });
  expect(upd.status).toBe(200);
  expect(upd.body).toMatchObject({ title: 'Guitar', weeklyMinutes: 180, windows, priority: 1 });

  expect((await c.del(`/api/projects/${created.body.id}`)).status).toBe(200);
  expect((await c.get(`/api/projects?weekStart=${WEEK}`)).body).toEqual([]);
  expect((await c.patch('/api/projects/nope', { title: 'x' })).status).toBe(404);
  expect((await c.del('/api/projects/nope')).status).toBe(404);
});

test('a one-off project only shows in its own week; inactive ones are hidden', async () => {
  const c = await createTestClient();
  await c.post('/api/projects', { ...fun, title: 'Every week' });
  await c.post('/api/projects', { ...fun, title: 'Only next week', weekStart: NEXT });
  const { body: paused } = await c.post('/api/projects', { ...fun, title: 'Paused' });
  await c.patch(`/api/projects/${paused.id}`, { active: false });
  const titles = async (w: string) => (await c.get(`/api/projects?weekStart=${w}`)).body.map((p: any) => p.title);
  expect(await titles(WEEK)).toEqual(['Every week']);
  expect(await titles(NEXT)).toEqual(['Every week', 'Only next week']);
  expect((await c.get('/api/projects?weekStart=2026-10-13')).status).toBe(400);
  expect((await c.get('/api/projects')).status).toBe(400);
});

test('validation: course for study only, 15-minute steps, block range, windows, Monday', async () => {
  const c = await createTestClient();
  const bad = await c.post('/api/projects', {
    title: '', kind: 'study', weeklyMinutes: 50, blockMin: 120, blockMax: 60, weekStart: '2026-10-13',
    windows: [{ days: [1], start: '12:00', end: '10:00' }],
  });
  expect(bad.status).toBe(400);
  expect(Object.keys(bad.body.error.fields).sort()).toEqual(
    ['blockMin', 'courseId', 'title', 'weekStart', 'weeklyMinutes', 'windows.0.start'].sort(),
  );
  const course = await c.post('/api/projects', { ...fun, courseId: 'x' });
  expect(course.body.error.fields.courseId).toMatch(/only allowed on study/);
  const unknown = await c.post('/api/projects', { ...fun, kind: 'study', courseId: 'nope' });
  expect(unknown.body.error.fields.courseId).toBe('Unknown course');
  expect((await c.post('/api/projects', { ...fun, weeklyMinutes: 6015 })).status).toBe(400);
  expect((await c.post('/api/projects', { ...fun, kind: 'chores' })).status).toBe(400);
});

test('study projects link a course; switching kind drops it; update re-checks the merged project', async () => {
  const c = await createTestClient();
  const { body: course } = await c.post('/api/courses', { name: 'Econometrics', color: '#3f51b5', weeklyGoalMinutes: 0 });
  const { body: p } = await c.post('/api/projects', { title: 'Midterm prep', kind: 'study', courseId: course.id, weeklyMinutes: 240 });
  expect(p.courseId).toBe(course.id);
  expect((await c.patch(`/api/projects/${p.id}`, { blockMin: 180 })).status).toBe(400); // 180 > blockMax 120
  const moved = await c.patch(`/api/projects/${p.id}`, { kind: 'fun' });
  expect(moved.status).toBe(200);
  expect(moved.body.courseId).toBeNull();
  expect((await c.patch(`/api/projects/${p.id}`, { kind: 'study' })).body.error.fields.courseId).toBeDefined();
});

test('planned and done minutes come from this week’s linked blocks; deleting keeps the blocks', async () => {
  const c = await createTestClient();
  const { body: p } = await c.post('/api/projects', { ...fun, kind: 'relax', title: 'Sauna' });
  const mk = (start: string, end: string, status?: 'proposed') =>
    createBlock(c.ctx, { category: 'rest', title: 'Sauna', start, end }, { projectId: p.id, ...(status ? { status } : {}) });
  const done = mk('2026-10-13T17:00:00.000Z', '2026-10-13T18:00:00.000Z');
  setBlockStatus(c.ctx, done.id, 'done', 45);
  mk('2026-10-15T17:00:00.000Z', '2026-10-15T18:30:00.000Z'); // committed, later this week
  mk('2026-10-16T17:00:00.000Z', '2026-10-16T18:00:00.000Z', 'proposed'); // drafts do not count
  mk('2026-10-20T17:00:00.000Z', '2026-10-20T18:00:00.000Z'); // next week
  const [row] = (await c.get(`/api/projects?weekStart=${WEEK}`)).body;
  expect(row).toMatchObject({ plannedMinutes: 150, doneMinutes: 45 });

  await c.del(`/api/projects/${p.id}`);
  const kept = c.ctx.db.select().from(blocks).where(eq(blocks.id, done.id)).get();
  expect(kept).toMatchObject({ status: 'done', projectId: null });
});

test('planner input: one goal per project for the week, minus time already used; project time is on top of course and startup goals', async () => {
  const c = await createTestClient();
  const course = createCourse(c.ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 300 });
  saveGoals(c.ctx, {
    startupMinutes: 240, workoutsTotal: null, workoutsByType: { gym: null, cardio: null, sport: null },
    freeEvenings: null, dailyKcal: null, dailyProteinG: null,
  });
  const exam = createProject(c.ctx, {
    title: 'Midterm', kind: 'study', courseId: course.id, weeklyMinutes: 240, priority: 1,
    windows: [{ days: [1], start: '14:00', end: '18:00' }], blockMin: 45, blockMax: 90,
  });
  const pitch = createProject(c.ctx, { title: 'Pitch deck', kind: 'startup', weeklyMinutes: 120 });
  createProject(c.ctx, { title: 'Other week', kind: 'fun', weeklyMinutes: 60, weekStart: '2026-10-19' });
  const done = createBlock(
    c.ctx,
    { category: 'study', title: 'Midterm', start: iso('2026-10-13', '10:00'), end: iso('2026-10-13', '11:00'), courseId: course.id },
    { projectId: exam.id },
  );
  setBlockStatus(c.ctx, done.id, 'done');
  createBlock(c.ctx, { category: 'startup', title: 'Pitch deck', start: iso('2026-10-15', '10:00'), end: iso('2026-10-15', '11:00') }, { projectId: pitch.id });

  const { goals } = buildPlannerInput(c.ctx, '2026-10-12');
  expect(goals.filter((g) => g.kind === 'project')).toEqual([
    {
      kind: 'project', projectId: exam.id, title: 'Midterm', category: 'study', minutes: 180, priority: 1, courseId: course.id,
      windows: [{ days: [1], start: '14:00', end: '18:00' }], block: { min: 45, max: 90 },
    },
    {
      kind: 'project', projectId: pitch.id, title: 'Pitch deck', category: 'startup', minutes: 60, priority: 2,
      windows: [], block: { min: 60, max: 120 },
    },
  ]);
  expect(goals.find((g) => g.kind === 'study')).toMatchObject({ courseId: course.id, minutes: 300 });
  expect(goals.find((g) => g.kind === 'startup')).toMatchObject({ minutes: 240 });
});

test('planned project blocks keep their projectId through draft and commit, and count as planned', async () => {
  const c = await createTestClient();
  const p = createProject(c.ctx, { title: 'Sauna', kind: 'relax', weeklyMinutes: 120 });
  const res = await c.post('/api/plans', { weekStart: '2026-10-19' });
  expect(res.status).toBe(201);
  const mine = (res.body.blocks as Block[]).filter((b) => b.projectId === p.id);
  expect(mine.length).toBeGreaterThan(0);
  for (const b of mine) expect(b).toMatchObject({ category: 'rest', title: 'Sauna', status: 'proposed' });
  expect(mine.reduce((n, b) => n + (Date.parse(b.end) - Date.parse(b.start)) / 60_000, 0)).toBe(120);
  expect((await c.post(`/api/plans/${res.body.plan.id}/commit`)).status).toBe(200);
  for (const b of mine) expect(getBlock(c.ctx, b.id)).toMatchObject({ status: 'committed', projectId: p.id });
  const [row] = (await c.get('/api/projects?weekStart=2026-10-19')).body;
  expect(row.plannedMinutes).toBe(120);
});

test('a project the planner cannot fit shows up as a project shortfall', async () => {
  const c = await createTestClient();
  const p = createProject(c.ctx, { title: 'Huge', kind: 'fun', weeklyMinutes: 6000, blockMax: 480 });
  const res = await c.post('/api/plans', { weekStart: '2026-10-19' });
  const s = res.body.plan.summary.shortfalls.find((x: any) => x.kind === 'project');
  expect(s).toMatchObject({ kind: 'project', projectId: p.id, projectTitle: 'Huge', unit: 'minutes' });
  expect(s.missing).toBeGreaterThan(0);
});

test('replan: blocks added for a displaced project block keep the projectId', () => {
  const ctx = createTestCtx();
  const course = createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 0 });
  // The project's blocks are capped at 60 min, so the displaced 2 h come back as one moved block plus an added one.
  const p = createProject(ctx, { title: 'Midterm', kind: 'study', courseId: course.id, weeklyMinutes: 120, blockMin: 45, blockMax: 60 });
  const b = createBlock(
    ctx,
    { category: 'study', title: 'Midterm', start: iso('2026-10-15', '19:00'), end: iso('2026-10-15', '21:00'), courseId: course.id },
    { projectId: p.id },
  );
  const r = quickAdd(ctx, { title: 'Party', category: 'social', when: { start: iso('2026-10-15', '19:00'), durationMinutes: 270 } });
  const added = r.draft!.changes.filter((x) => x.type === 'added');
  expect(added.length).toBeGreaterThan(0);
  for (const a of added) expect(a.projectId).toBe(p.id);
  const out = applyReplan(ctx, r.draft!.plan.id);
  expect(getBlock(ctx, b.id).projectId).toBe(p.id);
  const created = out.blocks.filter((x) => x.planId === out.plan.id);
  expect(created).toHaveLength(added.length);
  for (const x of created) expect(x).toMatchObject({ status: 'committed', projectId: p.id, courseId: course.id });
});

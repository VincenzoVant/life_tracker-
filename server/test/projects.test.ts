import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { blocks } from '../src/db/schema.js';
import { createBlock, setBlockStatus } from '../src/domains/blocks/service.js';
import { createTestClient } from './helpers.js';

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

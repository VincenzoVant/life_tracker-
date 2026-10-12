import { expect, test } from 'vitest';
import { createTestClient } from './helpers.js';

const body = { name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 360 };

test('create/list/update course', async () => {
  const c = await createTestClient();
  const created = await c.post('/api/courses', body);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ ...body, active: true });
  const upd = await c.patch(`/api/courses/${created.body.id}`, { weeklyGoalMinutes: 120 });
  expect(upd.status).toBe(200);
  expect(upd.body).toMatchObject({ name: 'Algorithms', weeklyGoalMinutes: 120 });
  await c.post('/api/courses', { ...body, name: 'Biology' });
  const list = await c.get('/api/courses');
  expect(list.body.map((x: any) => x.name)).toEqual(['Algorithms', 'Biology']);
  expect((await c.patch('/api/courses/nope', { name: 'x' })).status).toBe(404);
});

test('archive hides from default list but keeps it with includeArchived', async () => {
  const c = await createTestClient();
  const { body: course } = await c.post('/api/courses', body);
  const del = await c.del(`/api/courses/${course.id}`);
  expect(del.status).toBe(200);
  expect(del.body.active).toBe(false);
  expect((await c.get('/api/courses')).body).toEqual([]);
  const all = await c.get('/api/courses?includeArchived=true');
  expect(all.body.map((x: any) => x.id)).toEqual([course.id]);
});

test('duplicate active course names → 409 CONFLICT; archived names are reusable', async () => {
  const c = await createTestClient();
  const { body: a } = await c.post('/api/courses', body);
  const dup = await c.post('/api/courses', body);
  expect(dup.status).toBe(409);
  expect(dup.body.error.code).toBe('CONFLICT');
  await c.del(`/api/courses/${a.id}`);
  expect((await c.post('/api/courses', body)).status).toBe(201);
  // un-archiving into a taken name conflicts
  const un = await c.patch(`/api/courses/${a.id}`, { active: true });
  expect(un.status).toBe(409);
  // renaming into a taken name conflicts
  const { body: b } = await c.post('/api/courses', { ...body, name: 'Other' });
  expect((await c.patch(`/api/courses/${b.id}`, { name: 'Algorithms' })).status).toBe(409);
});

test('rejects weeklyGoalMinutes > 6000 and bad color', async () => {
  const c = await createTestClient();
  const res = await c.post('/api/courses', { name: 'X', color: 'red', weeklyGoalMinutes: 6001 });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.color).toBeDefined();
  expect(res.body.error.fields.weeklyGoalMinutes).toBeDefined();
});

test('blocks accept a real (even archived) courseId and deleting a course never breaks blocks', async () => {
  const c = await createTestClient();
  const { body: course } = await c.post('/api/courses', body);
  const blk = { category: 'study', title: 'S', start: '2026-10-14T22:00:00.000Z', end: '2026-10-14T23:00:00.000Z' };
  const ok = await c.post('/api/blocks', { ...blk, courseId: course.id });
  expect(ok.status).toBe(201);
  expect(ok.body.courseId).toBe(course.id);
  await c.del(`/api/courses/${course.id}`);
  expect((await c.post('/api/blocks', { ...blk, courseId: course.id })).status).toBe(201);
});

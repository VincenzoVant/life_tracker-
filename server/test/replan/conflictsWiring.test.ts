import { expect, test } from 'vitest';
import { zonedToUtc } from '@life-tracker/shared';
import { detectConflicts, listConflicts } from '../../src/calendar/conflicts.js';
import { createBlock } from '../../src/domains/blocks/service.js';
import { createCourse } from '../../src/domains/studies/service.js';
import { createTestClient, createTestCtx } from '../helpers.js';

const TZ = 'America/Los_Angeles';
const iso = (date: string, time: string): string => zonedToUtc(date, time, TZ).toISOString();

async function openConflict() {
  const ctx = createTestCtx(); // Wed 2026-10-14 12:00 PDT
  const course = createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 360 });
  createBlock(ctx, {
    category: 'study', title: 'Study — Algebra', start: iso('2026-10-15', '18:30'), end: iso('2026-10-15', '20:00'), courseId: course.id,
  });
  detectConflicts(ctx, {
    changed: [
      { calendarId: 'primary', eventId: 'e1', title: 'Dentist', start: iso('2026-10-15', '18:00'), end: iso('2026-10-15', '20:00'), updated: '2026-10-14T19:00:00.000Z' },
    ],
    removed: [],
  });
  const conflict = listConflicts(ctx, 'open')[0]!;
  return { ctx, conflict, c: await createTestClient(ctx) };
}

const statusOf = (ctx: Awaited<ReturnType<typeof openConflict>>['ctx'], id: number): string =>
  (ctx.sqlite.prepare('select status from conflicts where id = ?').get(id) as { status: string }).status;

test('replan then apply marks the real conflict replanned', async () => {
  const { ctx, conflict, c } = await openConflict();
  const res = await c.post(`/api/conflicts/${conflict.id}/replan`);
  expect(res.status).toBe(201);
  expect(res.body.plan.summary.conflictId).toBe(String(conflict.id));
  const applied = await c.post(`/api/replan/${res.body.plan.id}/apply`);
  expect(applied.status).toBe(200);
  expect(statusOf(ctx, conflict.id)).toBe('replanned');
});

test('replan then keep dismisses the real conflict', async () => {
  const { ctx, conflict, c } = await openConflict();
  const res = await c.post(`/api/conflicts/${conflict.id}/replan`);
  expect((await c.post(`/api/replan/${res.body.plan.id}/keep`)).status).toBe(200);
  expect(statusOf(ctx, conflict.id)).toBe('dismissed');
});

test('unknown or malformed conflict ids are rejected', async () => {
  const { c } = await openConflict();
  expect((await c.post('/api/conflicts/999/replan')).status).toBe(409);
  expect((await c.post('/api/conflicts/abc/replan')).status).toBe(409);
});

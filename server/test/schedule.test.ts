import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { localDateOf } from '@life-tracker/shared';
import { createTestClient, type TestClient } from './helpers.js';
import { blocks } from '../src/db/schema.js';
import { listBlocks, setBlockStatus, updateFixedBlockInternal } from '../src/domains/blocks/service.js';
import { materializeFixedEvents } from '../src/domains/schedule/materialize.js';

const TZ = 'America/Los_Angeles';

async function setup(): Promise<{ c: TestClient; courseId: string }> {
  const c = await createTestClient();
  const course = await c.post('/api/courses', { name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 360 });
  return { c, courseId: course.body.id };
}

const classBody = (courseId: string, extra: Record<string, unknown> = {}) => ({
  title: 'Algorithms lecture',
  kind: 'class',
  courseId,
  weekday: 1,
  startTime: '10:00',
  endTime: '11:20',
  validFrom: '2026-10-01',
  validTo: '2026-11-30',
  ...extra,
});

function eventBlocks(c: TestClient, eventId: string, includeRemoved = false) {
  return listBlocks(c.ctx, {
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2027-12-31T00:00:00Z'),
    includeRemoved,
  }).filter((b) => b.fixedEventId === eventId);
}

test('creates weekly occurrences within horizon and term dates only', async () => {
  const { c, courseId } = await setup();
  const res = await c.post('/api/schedule', classBody(courseId));
  expect(res.status).toBe(201);
  const bs = eventBlocks(c, res.body.id);
  expect(bs.map((b) => localDateOf(new Date(b.start), TZ))).toEqual([
    '2026-10-19',
    '2026-10-26',
    '2026-11-02',
    '2026-11-09',
    '2026-11-16',
    '2026-11-23',
    '2026-11-30',
  ]);
  for (const b of bs) {
    expect(b).toMatchObject({ category: 'study', source: 'fixed', locked: true, status: 'committed', courseId });
  }
  // 10:00 local across the DST change (Nov 1)
  expect(bs[0]!.start).toBe('2026-10-19T17:00:00.000Z');
  expect(bs[2]!.start).toBe('2026-11-02T18:00:00.000Z');
  expect(bs[2]!.end).toBe('2026-11-02T19:20:00.000Z');
});

test('materialize is idempotent', async () => {
  const { c, courseId } = await setup();
  await c.post('/api/schedule', classBody(courseId));
  expect(materializeFixedEvents(c.ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
  expect(materializeFixedEvents(c.ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
});

test('daily run without fixedEventId leaves a manually moved occurrence untouched', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId));
  const [first] = eventBlocks(c, ev.body.id);
  const moved = updateFixedBlockInternal(c.ctx, first!.id, {
    start: '2026-10-19T20:00:00.000Z',
    end: '2026-10-19T21:20:00.000Z',
  });
  expect(moved.start).toBe('2026-10-19T20:00:00.000Z');
  expect(materializeFixedEvents(c.ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
  expect(eventBlocks(c, ev.body.id)[0]!.start).toBe('2026-10-19T20:00:00.000Z');
});

test('daily run tops up the rolling window as days pass', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId, { validTo: '2026-12-31' }));
  const before = eventBlocks(c, ev.body.id).length;
  expect(before).toBe(8); // Mondays 10-19 .. 12-07
  c.ctx.clock.set('2026-11-04T20:00:00.000Z'); // horizon now reaches 12-30
  expect(materializeFixedEvents(c.ctx)).toEqual({ created: 3, updated: 0, removed: 0 }); // 12-14, 12-21, 12-28
  expect(eventBlocks(c, ev.body.id)).toHaveLength(11);
});

test('cancelled occurrence is not recreated after edit', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId));
  const before = eventBlocks(c, ev.body.id);
  const cancelled = before.find((b) => localDateOf(new Date(b.start), TZ) === '2026-10-26')!;
  expect((await c.del(`/api/blocks/${cancelled.id}`)).status).toBe(200);

  const upd = await c.patch(`/api/schedule/${ev.body.id}`, { startTime: '10:30', endTime: '11:50' });
  expect(upd.status).toBe(200);

  const all = eventBlocks(c, ev.body.id, true);
  const on26 = all.filter((b) => localDateOf(new Date(b.start), TZ) === '2026-10-26');
  expect(on26).toHaveLength(1);
  expect(on26[0]).toMatchObject({ id: cancelled.id, status: 'removed' });

  const active = eventBlocks(c, ev.body.id);
  expect(active).toHaveLength(6);
  for (const b of active) {
    const orig = before.find((o) => o.id === b.id)!;
    expect(orig).toBeDefined();
    expect(b.start).not.toBe(orig.start);
  }
  expect(active[0]!.start).toBe('2026-10-19T17:30:00.000Z');
});

test('shrinking validTo removes later committed occurrences', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId));
  await c.patch(`/api/schedule/${ev.body.id}`, { validTo: '2026-11-02' });
  const active = eventBlocks(c, ev.body.id);
  expect(active.map((b) => localDateOf(new Date(b.start), TZ))).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  expect(eventBlocks(c, ev.body.id, true)).toHaveLength(7);
});

test('work kind creates work blocks without course; class without courseId → 400', async () => {
  const { c, courseId } = await setup();
  const work = await c.post('/api/schedule', {
    title: 'Job',
    kind: 'work',
    weekday: 3,
    startTime: '13:00',
    endTime: '17:00',
    validFrom: '2026-10-01',
    validTo: '2026-10-31',
  });
  expect(work.status).toBe(201);
  const bs = eventBlocks(c, work.body.id);
  expect(bs.map((b) => b.category)).toEqual(['work', 'work', 'work']); // 10-14, 10-21, 10-28
  expect(bs.every((b) => b.courseId === null)).toBe(true);

  const noCourse = await c.post('/api/schedule', classBody(courseId, { courseId: undefined }));
  expect(noCourse.status).toBe(400);
  expect(noCourse.body.error.fields.courseId).toBeDefined();
  const workWithCourse = await c.post('/api/schedule', { ...work.body, id: undefined, courseId });
  expect(workWithCourse.status).toBe(400);
  const badTimes = await c.post('/api/schedule', classBody(courseId, { endTime: '09:00' }));
  expect(badTimes.status).toBe(400);
  expect(badTimes.body.error.fields.endTime).toBeDefined();
  const badRange = await c.post('/api/schedule', classBody(courseId, { validTo: '2026-09-01' }));
  expect(badRange.body.error.fields.validTo).toBeDefined();
});

test('fixed block time cannot be PATCHed via /api/blocks (409)', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId));
  const [b] = eventBlocks(c, ev.body.id);
  const res = await c.patch(`/api/blocks/${b!.id}`, { start: '2026-10-19T20:00:00.000Z', end: '2026-10-19T21:00:00.000Z' });
  expect(res.status).toBe(409);
});

test('deleting event removes future committed occurrences but keeps reviewed past ones', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId, { weekday: 3 })); // Wednesdays; 10-14 10:00 is past
  const bs = eventBlocks(c, ev.body.id);
  expect(localDateOf(new Date(bs[0]!.start), TZ)).toBe('2026-10-14');
  setBlockStatus(c.ctx, bs[0]!.id, 'done');

  expect((await c.del(`/api/schedule/${ev.body.id}`)).status).toBe(204);
  expect((await c.get('/api/schedule')).body).toEqual([]);

  const left = eventBlocks(c, ev.body.id);
  expect(left.map((b) => b.id)).toEqual([bs[0]!.id]);
  const row = c.ctx.db.select().from(blocks).where(eq(blocks.id, bs[0]!.id)).get();
  expect(row).toMatchObject({ status: 'done', fixedEventId: ev.body.id });
  expect(eventBlocks(c, ev.body.id, true).filter((b) => b.status === 'removed')).toHaveLength(bs.length - 1);
  expect((await c.del(`/api/schedule/${ev.body.id}`)).status).toBe(404);
});

test('lists events ordered by weekday then start time', async () => {
  const { c, courseId } = await setup();
  await c.post('/api/schedule', classBody(courseId, { weekday: 2, title: 'B' }));
  await c.post('/api/schedule', classBody(courseId, { weekday: 1, startTime: '14:00', endTime: '15:00', title: 'A2' }));
  await c.post('/api/schedule', classBody(courseId, { weekday: 1, title: 'A1' }));
  const list = await c.get('/api/schedule');
  expect(list.body.map((e: any) => e.title)).toEqual(['A1', 'A2', 'B']);
});

test('inactive event materializes nothing and deactivating removes future occurrences', async () => {
  const { c, courseId } = await setup();
  const ev = await c.post('/api/schedule', classBody(courseId));
  await c.patch(`/api/schedule/${ev.body.id}`, { active: false });
  expect(eventBlocks(c, ev.body.id)).toHaveLength(0);
  await c.patch(`/api/schedule/${ev.body.id}`, { active: true });
  expect(eventBlocks(c, ev.body.id)).toHaveLength(0 + 0); // removed ones are never recreated
});

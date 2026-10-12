import { expect, test } from 'vitest';
import type { BlockCreateInput, BlockStatus } from '@life-tracker/shared';
import { createBlock, getBlock } from '../src/domains/blocks/service.js';
import { createTask, listTasks } from '../src/domains/startup/service.js';
import { listSessions } from '../src/domains/workouts/service.js';
import { getPendingReview, submitReview } from '../src/domains/review/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

// America/Los_Angeles is UTC-7 all week; today = Wed 2026-10-14.
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
) {
  const start = utc(date, from);
  const end = new Date(new Date(start).getTime() + mins * 60_000).toISOString();
  return createBlock(ctx, { title: 'b', ...input, start, end } as BlockCreateInput, { status });
}

test('pending lists today and older unreviewed committed blocks, oldest first', () => {
  const ctx = createTestCtx();
  const today = add(ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const old = add(ctx, { category: 'work' }, '2026-10-12', '09:00', 60);
  add(ctx, { category: 'work' }, '2026-10-15', '09:00', 60); // tomorrow
  add(ctx, { category: 'work' }, '2026-10-14', '12:00', 60, 'proposed');
  const done = add(ctx, { category: 'work' }, '2026-10-14', '14:00', 60, 'done');
  add(ctx, { category: 'work' }, '2026-10-13', '14:00', 60, 'done'); // other day: not in reviewed
  const r = getPendingReview(ctx, '2026-10-14');
  expect(r.pending.map((b) => b.id)).toEqual([old.id, today.id]);
  expect(r.reviewed.map((b) => b.id)).toEqual([done.id]);
  expect(r.completedAt).toBeNull();
});

test('done/partial/skipped set actualMinutes; progress returned', () => {
  const ctx = createTestCtx();
  const a = add(ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const b = add(ctx, { category: 'work' }, '2026-10-14', '10:00', 60);
  const c = add(ctx, { category: 'work' }, '2026-10-14', '11:00', 60);
  const res = submitReview(ctx, {
    date: '2026-10-14',
    entries: [
      { blockId: a.id, outcome: 'done' },
      { blockId: b.id, outcome: 'partial', actualMinutes: 25 },
      { blockId: c.id, outcome: 'skipped' },
    ],
    unplanned: [],
  });
  expect([a, b, c].map((x) => getBlock(ctx, x.id)).map((x) => [x.status, x.actualMinutes])).toEqual([
    ['done', 60],
    ['partial', 25],
    ['skipped', 0],
  ]);
  expect(res.date).toBe('2026-10-14');
  expect(res.progress.weekStart).toBe('2026-10-12');
  expect(res.progress.work).toEqual({ planned: 180, actual: 85 });
});

test.each([0, -5, 61, 1.5])('partial with %s -> 400 with field and nothing written', async (bad) => {
  const client = await createTestClient();
  const a = add(client.ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const b = add(client.ctx, { category: 'work' }, '2026-10-14', '10:00', 60);
  const res = await client.post('/api/review', {
    date: '2026-10-14',
    entries: [
      { blockId: a.id, outcome: 'partial', actualMinutes: bad },
      { blockId: b.id, outcome: 'done' },
    ],
    unplanned: [],
  });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION');
  expect(res.body.error.fields['entries.0.actualMinutes']).toBeTruthy();
  expect(getBlock(client.ctx, b.id).status).toBe('committed');
  expect(getBlock(client.ctx, a.id).status).toBe('committed');
});

test('partial without minutes -> 400', async () => {
  const client = await createTestClient();
  const a = add(client.ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const res = await client.post('/api/review', {
    date: '2026-10-14',
    entries: [{ blockId: a.id, outcome: 'partial' }],
    unplanned: [],
  });
  expect(res.status).toBe(400);
  expect(res.body.error.fields['entries.0.actualMinutes']).toBeTruthy();
});

test('a failure midway rolls back earlier entries and the daily_reviews row', () => {
  const ctx = createTestCtx();
  const a = add(ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const bad = add(ctx, { category: 'work' }, '2026-10-14', '10:00', 60, 'proposed');
  expect(() =>
    submitReview(ctx, {
      date: '2026-10-14',
      entries: [
        { blockId: a.id, outcome: 'done' },
        { blockId: bad.id, outcome: 'done' },
      ],
      unplanned: [],
    }),
  ).toThrow();
  expect(getBlock(ctx, a.id).status).toBe('committed');
  expect(getPendingReview(ctx, '2026-10-14').completedAt).toBeNull();
});

test('re-review done -> skipped updates totals and deletes the workout session', () => {
  const ctx = createTestCtx();
  const w = add(ctx, { category: 'workout', workoutType: 'gym' }, '2026-10-14', '07:00', 60);
  const first = submitReview(ctx, {
    date: '2026-10-14',
    entries: [{ blockId: w.id, outcome: 'done', workout: { intensity: 4, gymFocus: 'legs' } }],
    unplanned: [],
  });
  expect(listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' })).toHaveLength(1);
  expect(first.progress.workouts.total.actual).toBe(1);
  const second = submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: w.id, outcome: 'skipped' }], unplanned: [] });
  expect(listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' })).toHaveLength(0);
  expect(second.progress.workouts.total.actual).toBe(0);
});

test('re-review partial 30 -> done keeps a single session with full minutes', () => {
  const ctx = createTestCtx();
  const w = add(ctx, { category: 'workout', workoutType: 'cardio' }, '2026-10-14', '07:00', 60);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: w.id, outcome: 'partial', actualMinutes: 30 }], unplanned: [] });
  expect(listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' }).map((s) => s.durationMinutes)).toEqual([30]);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: w.id, outcome: 'done' }], unplanned: [] });
  const sessions = listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' });
  expect(sessions.map((s) => s.durationMinutes)).toEqual([60]);
  expect(getBlock(ctx, w.id).actualMinutes).toBe(60);
});

test('done -> partial uses the new minutes', () => {
  const ctx = createTestCtx();
  const a = add(ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: a.id, outcome: 'done' }], unplanned: [] });
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: a.id, outcome: 'partial', actualMinutes: 20 }], unplanned: [] });
  expect(getBlock(ctx, a.id)).toMatchObject({ status: 'partial', actualMinutes: 20 });
});

test('completeStartupTask marks linked task done', () => {
  const ctx = createTestCtx();
  const t = createTask(ctx, { title: 'Ship it' });
  const other = createTask(ctx, { title: 'Other' });
  const b = add(ctx, { category: 'startup', startupTaskId: t.id }, '2026-10-14', '09:00', 60);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'done', completeStartupTask: true }], unplanned: [] });
  const status = Object.fromEntries(listTasks(ctx).map((x) => [x.id, x.status]));
  expect(status[t.id]).toBe('done');
  expect(status[other.id]).not.toBe('done');
});

test('unplanned entries create unplanned done blocks', () => {
  const ctx = createTestCtx();
  const res = submitReview(ctx, {
    date: '2026-10-14',
    entries: [],
    unplanned: [
      { category: 'work', title: 'Surprise', start: utc('2026-10-14', '13:00'), end: utc('2026-10-14', '14:00') },
      { category: 'work', title: 'Short', start: utc('2026-10-14', '15:00'), end: utc('2026-10-14', '16:00'), actualMinutes: 40 },
      {
        category: 'workout',
        workoutType: 'sport',
        title: 'Pickup',
        start: utc('2026-10-14', '17:00'),
        end: utc('2026-10-14', '18:00'),
        workout: { sportName: 'soccer' },
      },
    ],
  });
  const r = getPendingReview(ctx, '2026-10-14');
  expect(r.reviewed.map((b) => [b.source, b.status, b.actualMinutes])).toEqual([
    ['unplanned', 'done', 60],
    ['unplanned', 'partial', 40],
    ['unplanned', 'done', 60],
  ]);
  expect(listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' }).map((s) => s.sportName)).toEqual(['soccer']);
  expect(res.progress.work).toEqual({ planned: 0, actual: 100 });
});

test('review of a proposed or removed block -> 409 INVALID_TRANSITION', async () => {
  const client = await createTestClient();
  const p = add(client.ctx, { category: 'work' }, '2026-10-14', '09:00', 60, 'proposed');
  const r = add(client.ctx, { category: 'work' }, '2026-10-14', '10:00', 60, 'removed');
  for (const id of [p.id, r.id]) {
    const res = await client.post('/api/review', { date: '2026-10-14', entries: [{ blockId: id, outcome: 'done' }], unplanned: [] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  }
});

test('unknown block -> 404', async () => {
  const client = await createTestClient();
  const res = await client.post('/api/review', { date: '2026-10-14', entries: [{ blockId: 'nope', outcome: 'done' }], unplanned: [] });
  expect(res.status).toBe(404);
});

test('block 23:30-00:30 starting Wed shows in Wed review, not Thu reviewed list', () => {
  const ctx = createTestCtx();
  const b = add(ctx, { category: 'work' }, '2026-10-14', '23:30', 60);
  expect(getPendingReview(ctx, '2026-10-14').pending.map((x) => x.id)).toEqual([b.id]);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'done' }], unplanned: [] });
  expect(getPendingReview(ctx, '2026-10-14').reviewed.map((x) => x.id)).toEqual([b.id]);
  const thu = getPendingReview(ctx, '2026-10-15');
  expect(thu.reviewed).toEqual([]);
  expect(thu.pending).toEqual([]);
});

test('completedAt recorded; GET route works', async () => {
  const client = await createTestClient();
  const a = add(client.ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const post = await client.post('/api/review', { date: '2026-10-14', entries: [{ blockId: a.id, outcome: 'done' }] });
  expect(post.status).toBe(200);
  expect(post.body.date).toBe('2026-10-14');
  const get = await client.get('/api/review?date=2026-10-14');
  expect(get.status).toBe(200);
  expect(get.body.completedAt).toBe('2026-10-14T19:00:00.000Z');
  expect(get.body.reviewed).toHaveLength(1);
  expect((await client.get('/api/review?date=bad')).status).toBe(400);
});

test('re-review partial -> done without workout keeps stored details', () => {
  const ctx = createTestCtx();
  const w = add(ctx, { category: 'workout', workoutType: 'cardio' }, '2026-10-14', '07:00', 60);
  submitReview(ctx, {
    date: '2026-10-14',
    entries: [{ blockId: w.id, outcome: 'partial', actualMinutes: 30, workout: { intensity: 4, distanceKm: 5 } }],
    unplanned: [],
  });
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: w.id, outcome: 'done' }], unplanned: [] });
  const [s] = listSessions(ctx, { from: '2026-10-14', to: '2026-10-14' });
  expect(s).toMatchObject({ durationMinutes: 60, intensity: 4, distanceKm: 5 });
});

test('a failed unplanned entry rolls back the whole submission', () => {
  const ctx = createTestCtx();
  const a = add(ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  expect(() =>
    submitReview(ctx, {
      date: '2026-10-14',
      entries: [{ blockId: a.id, outcome: 'done' }],
      // a workout block without workoutType fails to create, after the entries were applied
      unplanned: [
        { title: 'x', category: 'workout', start: utc('2026-10-14', '12:00'), end: utc('2026-10-14', '13:00') } as BlockCreateInput,
      ],
    }),
  ).toThrow();
  expect(getBlock(ctx, a.id).status).toBe('committed');
  expect(getPendingReview(ctx, '2026-10-14').completedAt).toBeNull();
  expect(getPendingReview(ctx, '2026-10-14').reviewed).toHaveLength(0);
});

test('duplicate blockId -> 400', async () => {
  const client = await createTestClient();
  const a = add(client.ctx, { category: 'work' }, '2026-10-14', '09:00', 60);
  const res = await client.post('/api/review', {
    date: '2026-10-14',
    entries: [
      { blockId: a.id, outcome: 'done' },
      { blockId: a.id, outcome: 'skipped' },
    ],
    unplanned: [],
  });
  expect(res.status).toBe(400);
  expect(res.body.error.fields['entries.1.blockId']).toBeTruthy();
});

test('completeStartupTask is ignored when the block is skipped', () => {
  const ctx = createTestCtx();
  const t = createTask(ctx, { title: 'Ship it' });
  const b = add(ctx, { category: 'startup', startupTaskId: t.id }, '2026-10-14', '09:00', 60);
  submitReview(ctx, { date: '2026-10-14', entries: [{ blockId: b.id, outcome: 'skipped', completeStartupTask: true }], unplanned: [] });
  expect(listTasks(ctx).find((x) => x.id === t.id)?.status).not.toBe('done');
});

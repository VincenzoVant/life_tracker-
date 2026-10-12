import { expect, test } from 'vitest';
import { localDateOf, dayRangeUtc, type Block } from '@life-tracker/shared';
import { canTransition } from '../src/domains/blocks/status.js';
import { createBlockEventBus, type BlockChange } from '../src/domains/blocks/events.js';
import { createBlock, deleteProposedBlocks, getBlock, listBlocks, setBlockStatus, updateBlock } from '../src/domains/blocks/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

const rest = (start: string, end: string, title = 'Walk') => ({ category: 'rest' as const, title, start, end });

test('create manual block defaults to committed/manual/unlocked and emits created', async () => {
  const c = await createTestClient();
  const seen: BlockChange[] = [];
  c.ctx.events.subscribe((e) => seen.push(e));
  const res = await c.post('/api/blocks', rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'));
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'committed', source: 'manual', locked: false, actualMinutes: null, courseId: null });
  expect(seen).toEqual([{ blockId: res.body.id, kind: 'created' }]);
});

test('list returns overlapping blocks ordered by start, excludes removed by default', async () => {
  const c = await createTestClient();
  const b = await c.post('/api/blocks', rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z', 'B'));
  const a = await c.post('/api/blocks', rest('2026-10-14T20:00:00.000Z', '2026-10-14T21:00:00.000Z', 'A'));
  const gone = await c.post('/api/blocks', rest('2026-10-14T21:00:00.000Z', '2026-10-14T21:30:00.000Z', 'Gone'));
  await c.post('/api/blocks', rest('2026-10-15T20:00:00.000Z', '2026-10-15T21:00:00.000Z', 'Outside'));
  await c.del(`/api/blocks/${gone.body.id}`);
  const q = '/api/blocks?from=2026-10-14T00:00:00.000Z&to=2026-10-15T00:00:00.000Z';
  const res = await c.get(q);
  expect(res.body.map((x: Block) => x.title)).toEqual(['A', 'B']);
  expect(res.body[0].id).toBe(a.body.id);
  expect(res.body[1].id).toBe(b.body.id);
  const all = await c.get(`${q}&includeRemoved=true`);
  expect(all.body.map((x: Block) => x.title)).toEqual(['A', 'Gone', 'B']);
  // half-open: a block ending exactly at `from` is not returned
  const edge = await c.get('/api/blocks?from=2026-10-14T21:00:00.000Z&to=2026-10-14T21:30:00.000Z');
  expect(edge.body).toEqual([]);
  expect((await c.get('/api/blocks?from=nope&to=x')).status).toBe(400);
});

test('delete sets removed and emits removed; removed block cannot be patched', async () => {
  const c = await createTestClient();
  const made = await c.post('/api/blocks', rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'));
  const seen: BlockChange[] = [];
  c.ctx.events.subscribe((e) => seen.push(e));
  const del = await c.del(`/api/blocks/${made.body.id}`);
  expect(del.status).toBe(200);
  expect(del.body.status).toBe('removed');
  expect(seen).toEqual([{ blockId: made.body.id, kind: 'removed' }]);
  const patch = await c.patch(`/api/blocks/${made.body.id}`, { title: 'x' });
  expect(patch.status).toBe(409);
  expect(patch.body.error.code).toBe('INVALID_TRANSITION');
  expect((await c.del(`/api/blocks/${made.body.id}`)).body.error.code).toBe('INVALID_TRANSITION');
  expect((await c.del('/api/blocks/nope')).status).toBe(404);
});

test('patch merges and re-validates the merged block', async () => {
  const c = await createTestClient();
  const made = await c.post('/api/blocks', rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'));
  const ok = await c.patch(`/api/blocks/${made.body.id}`, { title: 'Run', end: '2026-10-14T23:30:00.000Z' });
  expect(ok.status).toBe(200);
  expect(ok.body).toMatchObject({ title: 'Run', end: '2026-10-14T23:30:00.000Z' });
  const bad = await c.patch(`/api/blocks/${made.body.id}`, { start: '2026-10-15T00:00:00.000Z' });
  expect(bad.status).toBe(400);
  expect(bad.body.error.fields.end).toBe('End must be after start');
  const noWorkoutType = await c.patch(`/api/blocks/${made.body.id}`, { category: 'workout' });
  expect(noWorkoutType.body.error.fields.workoutType).toBeDefined();
  const good = await c.patch(`/api/blocks/${made.body.id}`, { category: 'workout', workoutType: 'gym' });
  expect(good.body).toMatchObject({ category: 'workout', workoutType: 'gym' });
});

test('canTransition table', () => {
  expect(canTransition('proposed', 'done')).toBe(false);
  expect(canTransition('proposed', 'committed')).toBe(true);
  expect(canTransition('proposed', 'removed')).toBe(true);
  expect(canTransition('committed', 'partial')).toBe(true);
  expect(canTransition('committed', 'proposed')).toBe(false);
  expect(canTransition('done', 'skipped')).toBe(true);
  expect(canTransition('partial', 'done')).toBe(true);
  expect(canTransition('done', 'removed')).toBe(false);
  expect(canTransition('removed', 'committed')).toBe(false);
  expect(canTransition('removed', 'removed')).toBe(false);
});

test('setBlockStatus applies minutes and rejects invalid transitions', () => {
  const ctx = createTestCtx();
  const b = createBlock(ctx, rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'));
  expect(setBlockStatus(ctx, b.id, 'done')).toMatchObject({ status: 'done', actualMinutes: 60 });
  expect(setBlockStatus(ctx, b.id, 'partial', 30)).toMatchObject({ status: 'partial', actualMinutes: 30 });
  expect(setBlockStatus(ctx, b.id, 'skipped')).toMatchObject({ status: 'skipped', actualMinutes: 0 });
  expect(() => setBlockStatus(ctx, b.id, 'committed')).toThrowError(/Cannot change/);
});

test('fixed blocks reject time changes', () => {
  const ctx = createTestCtx();
  const b = createBlock(ctx, rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'), { source: 'fixed', locked: true });
  expect(() => updateBlock(ctx, b.id, { start: '2026-10-14T22:30:00.000Z' })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
  expect(() => updateBlock(ctx, b.id, { category: 'work' })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
  expect(updateBlock(ctx, b.id, { title: 'Renamed' }).title).toBe('Renamed');
});

test('unknown courseId → 400 fields.courseId (real ids are covered in studies.test.ts)', async () => {
  const c = await createTestClient();
  const res = await c.post('/api/blocks', { category: 'study', title: 'S', start: '2026-10-14T22:00:00.000Z', end: '2026-10-14T23:00:00.000Z', courseId: 'nope' });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.courseId).toBe('Unknown course');
  const t = await c.post('/api/blocks', { category: 'startup', title: 'S', start: '2026-10-14T22:00:00.000Z', end: '2026-10-14T23:00:00.000Z', startupTaskId: 'nope' });
  expect(t.body.error.fields.startupTaskId).toBe('Unknown task');
});

test('block 23:30-00:30 local is returned for both days ranges but belongs to start day', () => {
  const ctx = createTestCtx();
  const tz = 'America/Los_Angeles';
  // Wed 2026-10-14 23:30 PDT = Thu 06:30Z
  const b = createBlock(ctx, rest('2026-10-15T06:30:00.000Z', '2026-10-15T07:30:00.000Z', 'Late'));
  for (const day of ['2026-10-14', '2026-10-15']) {
    const r = dayRangeUtc(day, tz);
    expect(listBlocks(ctx, { from: r.start, to: r.end }).map((x) => x.id)).toEqual([b.id]);
  }
  expect(localDateOf(new Date(b.start), tz)).toBe('2026-10-14');
});

test('deleteProposedBlocks hard-deletes only proposed blocks and emits nothing', () => {
  const ctx = createTestCtx();
  const seen: BlockChange[] = [];
  const p = createBlock(ctx, rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'), { status: 'proposed', source: 'planner' });
  const k = createBlock(ctx, rest('2026-10-14T23:00:00.000Z', '2026-10-15T00:00:00.000Z'));
  ctx.events.subscribe((e) => seen.push(e));
  deleteProposedBlocks(ctx, [p.id, k.id]);
  expect(() => getBlock(ctx, p.id)).toThrowError(/not found/);
  expect(getBlock(ctx, k.id).id).toBe(k.id);
  expect(seen).toEqual([]);
});

test('event bus unsubscribes and is synchronous', () => {
  const bus = createBlockEventBus();
  const seen: string[] = [];
  const off = bus.subscribe((c) => seen.push(c.blockId));
  bus.emit({ blockId: 'a', kind: 'created' });
  off();
  bus.emit({ blockId: 'b', kind: 'created' });
  expect(seen).toEqual(['a']);
});

test('GET /api/blocks/:id returns the block; unknown id is 404', async () => {
  const c = await createTestClient();
  const made = await c.post('/api/blocks', rest('2026-10-14T22:00:00.000Z', '2026-10-14T23:00:00.000Z'));
  const res = await c.get(`/api/blocks/${made.body.id}`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: made.body.id, title: 'Walk' });
  expect((await c.get('/api/blocks/nope')).status).toBe(404);
});

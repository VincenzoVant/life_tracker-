import { expect, test } from 'vitest';
import { enqueueFutureMirrored } from '../../src/calendar/enqueue.js';
import { syncQueue } from '../../src/db/schema.js';
import { createBlock, setBlockStatus, updateBlock } from '../../src/domains/blocks/service.js';
import { createTestCtx } from '../helpers.js';

type TestCtx = ReturnType<typeof createTestCtx>;

const mk = (ctx: TestCtx, status: 'proposed' | 'committed', opts: { source?: 'planner' | 'unplanned' } = {}, day = 15) =>
  createBlock(
    ctx,
    { category: 'study', title: 'x', start: `2026-10-${day}T10:00:00.000Z`, end: `2026-10-${day}T11:00:00.000Z` },
    { status, ...opts },
  );
const queue = (ctx: TestCtx) => ctx.db.select().from(syncQueue).all();

test('committing a draft enqueues one create per block; proposed blocks enqueue nothing', () => {
  const ctx = createTestCtx();
  const a = mk(ctx, 'proposed');
  const b = mk(ctx, 'proposed');
  expect(queue(ctx)).toHaveLength(0);
  setBlockStatus(ctx, a.id, 'committed');
  setBlockStatus(ctx, b.id, 'committed');
  expect(queue(ctx).map((q) => q.op)).toEqual(['create', 'create']);
});

test('unplanned review blocks are never enqueued', () => {
  const ctx = createTestCtx();
  mk(ctx, 'committed', { source: 'unplanned' });
  expect(queue(ctx)).toHaveLength(0);
});

test('two edits before sync → still one queue row', () => {
  const ctx = createTestCtx();
  const a = mk(ctx, 'committed');
  updateBlock(ctx, a.id, { title: 'y' });
  updateBlock(ctx, a.id, { title: 'z' });
  expect(queue(ctx)).toHaveLength(1);
});

test('removing a block that never synced deletes its pending create row', () => {
  const ctx = createTestCtx();
  const a = mk(ctx, 'committed');
  expect(queue(ctx)).toHaveLength(1);
  setBlockStatus(ctx, a.id, 'removed');
  expect(queue(ctx)).toHaveLength(0);
});

test('enqueueFutureMirrored queues future unsynced mirrored blocks only', () => {
  const ctx = createTestCtx();
  mk(ctx, 'committed');
  mk(ctx, 'committed', {}, 10); // past
  ctx.db.delete(syncQueue).run();
  expect(enqueueFutureMirrored(ctx)).toBe(1);
  expect(queue(ctx)).toHaveLength(1);
});

test('a throwing enqueue never breaks the caller', () => {
  const ctx = createTestCtx();
  const a = mk(ctx, 'committed');
  ctx.sqlite.exec('drop table sync_queue');
  expect(() => updateBlock(ctx, a.id, { title: 'q' })).not.toThrow();
});

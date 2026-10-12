import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { blocks, syncQueue } from '../db/schema.js';
import { getBlock } from '../domains/blocks/service.js';
import { deriveOp } from './eventBody.js';

/** Re-derives what the block needs: drops the queue row, or upserts the single row for it. */
export function enqueueBlock(ctx: Ctx, blockId: string): void {
  const exists = ctx.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.id, blockId)).get();
  const op = exists ? deriveOp(getBlock(ctx, blockId)) : null;
  if (!op) {
    ctx.db.delete(syncQueue).where(eq(syncQueue.blockId, blockId)).run();
    return;
  }
  const now = ctx.clock.now().toISOString();
  ctx.db
    .insert(syncQueue)
    .values({ blockId, op, attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: syncQueue.blockId,
      set: {
        attempts: sql`case when ${syncQueue.op} = ${op} then ${syncQueue.attempts} else 0 end`,
        op,
        nextAttemptAt: now,
        updatedAt: now,
      },
    })
    .run();
}

/** Subscribes to block changes. Never throws: a failing listener would abort the caller's transaction. */
export function registerSyncEnqueue(ctx: Ctx): () => void {
  return ctx.events.subscribe((c) => {
    try {
      enqueueBlock(ctx, c.blockId);
    } catch {
      /* the queue is re-derivable (see enqueueFutureMirrored); never break the caller */
    }
  });
}

/** Enqueues creates for every mirrored block that ends in the future and has no Google event yet. */
export function enqueueFutureMirrored(ctx: Ctx): number {
  const ids = ctx.db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        gt(blocks.end, ctx.clock.now().toISOString()),
        isNull(blocks.gcalEventId),
        ne(blocks.source, 'unplanned'),
        inArray(blocks.status, ['committed', 'done', 'partial', 'skipped']),
      ),
    )
    .all();
  for (const { id } of ids) enqueueBlock(ctx, id);
  return ids.length;
}

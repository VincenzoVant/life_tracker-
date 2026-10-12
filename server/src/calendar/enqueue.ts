import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { blocks, syncQueue } from '../db/schema.js';
import { getBlock } from '../domains/blocks/service.js';
import { getTimezone } from '../domains/settings/service.js';
import { appOrigin, deriveOp, eventHash, toGoogleEvent } from './eventBody.js';

/** Re-derives what the block needs: drops the queue row, or upserts the single row for it. */
export function enqueueBlock(ctx: Ctx, blockId: string): void {
  const exists = ctx.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.id, blockId)).get();
  const block = exists ? getBlock(ctx, blockId) : null;
  const op = block ? deriveOp(block) : null;
  // A change that leaves the event body as Google has it (e.g. status only) needs no push.
  const unchanged =
    block && op === 'update' && (block as { gcalHash?: string | null }).gcalHash === eventHash(toGoogleEvent(block, { tz: getTimezone(ctx), appOrigin: appOrigin(ctx) }));
  if (!op || unchanged) {
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
    } catch (err) {
      // The queue is re-derivable (see enqueueFutureMirrored); never break the caller, but do leave a trace.
      console.error('sync enqueue failed', c.blockId, err);
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

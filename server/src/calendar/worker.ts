import { and, asc, eq, lte } from 'drizzle-orm';
import type { Block } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { syncQueue } from '../db/schema.js';
import { getBlock, setGcalFields } from '../domains/blocks/service.js';
import { getTimezone } from '../domains/settings/service.js';
import { CalendarApiError, type CalendarClient } from './client.js';
import { enqueueBlock } from './enqueue.js';
import { appOrigin, deriveOp, eventHash, toGoogleEvent } from './eventBody.js';
import { getCalendarState, updateCalendarState } from './state.js';

type QueueRow = typeof syncQueue.$inferSelect;
type StoredBlock = Block & { gcalHash?: string | null };

export interface ProcessResult {
  done: number;
  failed: number;
  paused: 'reconnect' | 'calendar_missing' | null;
}

export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** (attempts - 1), 3600);
}

const CLEARED = { gcalEventId: null, gcalEtag: null, gcalHash: null, gcalSyncedAt: null } as const;

/** Removes the row unless the block changed (and re-enqueued) while the API call was in flight. */
function finish(ctx: Ctx, row: QueueRow): void {
  ctx.db
    .delete(syncQueue)
    .where(and(eq(syncQueue.id, row.id), eq(syncQueue.updatedAt, row.updatedAt)))
    .run();
}

function dropRow(ctx: Ctx, row: QueueRow): void {
  ctx.db.delete(syncQueue).where(eq(syncQueue.id, row.id)).run();
}

export async function processQueue(
  ctx: Ctx,
  client: CalendarClient,
  opts: { limit?: number } = {},
): Promise<ProcessResult> {
  const result: ProcessResult = { done: 0, failed: 0, paused: null };
  if (ctx.google.needsReconnect()) return { ...result, paused: 'reconnect' };
  const state = getCalendarState(ctx);
  if (state.calendarMissing) return { ...result, paused: 'calendar_missing' };
  const calendarId = state.lifeTrackerCalendarId;
  if (!calendarId) return result;

  const tz = getTimezone(ctx);
  const origin = appOrigin(ctx);
  const rows = ctx.db
    .select()
    .from(syncQueue)
    .where(lte(syncQueue.nextAttemptAt, ctx.clock.now().toISOString()))
    .orderBy(asc(syncQueue.createdAt), asc(syncQueue.id))
    .limit(opts.limit ?? 50)
    .all();

  for (const row of rows) {
    let block: StoredBlock;
    try {
      block = getBlock(ctx, row.blockId) as StoredBlock;
    } catch {
      dropRow(ctx, row);
      continue;
    }
    const op = deriveOp(block);
    if (!op) {
      dropRow(ctx, row);
      result.done++;
      continue;
    }
    const body = toGoogleEvent(block, { tz, appOrigin: origin });
    const hash = eventHash(body);
    if (op === 'update' && hash === block.gcalHash) {
      dropRow(ctx, row);
      result.done++;
      continue;
    }

    try {
      const syncedAt = ctx.clock.now().toISOString();
      if (op === 'create') {
        const ev = await client.insertEvent(calendarId, body);
        setGcalFields(ctx, block.id, { gcalEventId: ev.id, gcalEtag: ev.etag, gcalHash: hash, gcalSyncedAt: syncedAt });
      } else if (op === 'update') {
        const ev = await client.patchEvent(calendarId, block.gcalEventId!, body);
        setGcalFields(ctx, block.id, { gcalEventId: ev.id, gcalEtag: ev.etag, gcalHash: hash, gcalSyncedAt: syncedAt });
      } else {
        try {
          await client.deleteEvent(calendarId, block.gcalEventId!);
        } catch (err) {
          if (!(err instanceof CalendarApiError) || (err.status !== 404 && err.status !== 410)) throw err;
        }
        setGcalFields(ctx, block.id, CLEARED);
      }
      finish(ctx, row);
      // The block may have been removed while the call was in flight: re-derive so the delete is queued.
      if (op !== 'delete') enqueueBlock(ctx, block.id);
      result.done++;
    } catch (err) {
      let status = err instanceof CalendarApiError ? err.status : 0;
      let message = err instanceof Error ? err.message : String(err);
      if (status === 401) {
        ctx.google.markNeedsReconnect();
        return { ...result, paused: 'reconnect' };
      }
      if (status === 410) {
        finish(ctx, row);
        result.done++;
        continue;
      }
      if (status === 404 && op !== 'delete') {
        let exists: boolean | null = null;
        try {
          exists = await client.calendarExists(calendarId);
        } catch (probeErr) {
          status = probeErr instanceof CalendarApiError ? probeErr.status : 0;
          message = probeErr instanceof Error ? probeErr.message : String(probeErr);
          if (status === 401) {
            ctx.google.markNeedsReconnect();
            return { ...result, paused: 'reconnect' };
          }
        }
        if (exists === false) {
          updateCalendarState(ctx, { calendarMissing: true });
          return { ...result, paused: 'calendar_missing' };
        }
        if (exists === true && op === 'update') {
          // Only the event is gone: forget it so the next run recreates it.
          setGcalFields(ctx, block.id, CLEARED);
          ctx.db.update(syncQueue).set({ op: 'create' }).where(eq(syncQueue.id, row.id)).run();
          continue;
        }
      }
      const attempts = row.attempts + 1;
      const next = new Date(ctx.clock.now().getTime() + backoffSeconds(attempts) * 1000).toISOString();
      ctx.db
        .update(syncQueue)
        .set({ attempts, nextAttemptAt: next, lastError: message })
        .where(eq(syncQueue.id, row.id))
        .run();
      result.failed++;
    }
  }
  return result;
}

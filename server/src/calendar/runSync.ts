import { asc, eq, gt } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { blocks, syncQueue } from '../db/schema.js';
import { CalendarApiError } from './client.js';
import { detectConflicts } from './conflicts.js';
import { pullBusyCalendars, type BusyEventRow } from './pullBusy.js';
import { pullLifeTrackerChanges } from './pullLifeTracker.js';
import { getCalendarState, updateCalendarState } from './state.js';
import { processQueue } from './worker.js';

export interface SyncRunResult {
  skipped?: 'not_connected' | 'reconnect' | 'calendar_missing';
  pushed?: number;
  moved?: number;
  deleted?: number;
  busyChanged?: number;
  conflictsOpened?: number;
}

const inFlight = new WeakMap<object, Promise<SyncRunResult>>();

/** One full sync pass. Concurrent callers share the run already in flight. */
export function runSync(ctx: Ctx): Promise<SyncRunResult> {
  const running = inFlight.get(ctx.sqlite);
  if (running) return running;
  const p = doSync(ctx).finally(() => inFlight.delete(ctx.sqlite));
  inFlight.set(ctx.sqlite, p);
  return p;
}

function firstFailingQueueError(ctx: Ctx): string | null {
  const row = ctx.db.select().from(syncQueue).where(gt(syncQueue.attempts, 0)).orderBy(asc(syncQueue.id)).get();
  return row?.lastError ?? null;
}

async function doSync(ctx: Ctx): Promise<SyncRunResult> {
  if (!ctx.google.isConnected()) return { skipped: 'not_connected' };
  if (ctx.google.needsReconnect()) return { skipped: 'reconnect' };
  const client = ctx.google.client();
  if (!client) return { skipped: 'reconnect' };
  const state = getCalendarState(ctx);
  if (state.calendarMissing) return { skipped: 'calendar_missing' };
  if (!state.lifeTrackerCalendarId) return { skipped: 'not_connected' };

  const result: SyncRunResult = {};
  let error: string | null = null;
  let authFailed = false;

  /** Runs a step; a 401 pauses the whole run, any other error is recorded (first wins) and later steps still run. */
  async function step<T>(fn: () => Promise<T>): Promise<T | null> {
    if (authFailed) return null;
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        ctx.google.markNeedsReconnect();
        authFailed = true;
      } else {
        error ??= err instanceof Error ? err.message : String(err);
      }
      return null;
    }
  }

  // Pull first so a newer Google move beats a queued app edit, then push (which carries the app's other fields).
  const lt = await step(() => pullLifeTrackerChanges(ctx, client));
  result.moved = lt?.moved ?? 0;
  result.deleted = lt?.deleted ?? 0;

  const push = await step(() => processQueue(ctx, client));
  if (push?.paused === 'reconnect') authFailed = true;
  result.pushed = push?.done ?? 0;
  if (push && push.failed > 0) error ??= firstFailingQueueError(ctx);

  const busy: { changed: BusyEventRow[]; removed: BusyEventRow[] } | null = await step(() => pullBusyCalendars(ctx, client));
  result.busyChanged = busy?.changed.length ?? 0;
  if (busy) result.conflictsOpened = detectConflicts(ctx, busy).opened;

  // Re-pushes queued during the pulls.
  const again = await step(() => processQueue(ctx, client));
  if (again) result.pushed += again.done;
  if (again && again.failed > 0) error ??= firstFailingQueueError(ctx);

  updateCalendarState(ctx, { lastSyncAt: ctx.clock.now().toISOString(), lastError: error });
  return result;
}

export interface QueueSummary {
  pending: number;
  failing: Array<{ blockId: string; title: string; attempts: number; lastError: string | null; nextAttemptAt: string }>;
}

export function queueSummary(ctx: Ctx): QueueSummary {
  const rows = ctx.db
    .select({
      blockId: syncQueue.blockId,
      attempts: syncQueue.attempts,
      lastError: syncQueue.lastError,
      nextAttemptAt: syncQueue.nextAttemptAt,
      title: blocks.title,
    })
    .from(syncQueue)
    .leftJoin(blocks, eq(blocks.id, syncQueue.blockId))
    .orderBy(asc(syncQueue.id))
    .all();
  return {
    pending: rows.length,
    failing: rows
      .filter((r) => r.attempts > 0)
      .map((r) => ({ blockId: r.blockId, title: r.title ?? '', attempts: r.attempts, lastError: r.lastError, nextAttemptAt: r.nextAttemptAt })),
  };
}

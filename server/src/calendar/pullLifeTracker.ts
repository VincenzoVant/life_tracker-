import { eq, isNotNull } from 'drizzle-orm';
import type { Block } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { blocks, googleChanges, syncQueue } from '../db/schema.js';
import { applyExternalTimes, getBlock, setBlockStatus, setGcalFields } from '../domains/blocks/service.js';
import { getTimezone } from '../domains/settings/service.js';
import { CalendarApiError, type CalendarClient, type GEvent } from './client.js';
import { enqueueBlock } from './enqueue.js';
import { appOrigin, eventHash, toGoogleEvent } from './eventBody.js';
import { getCalendarState, updateCalendarState } from './state.js';

export interface PullResult {
  moved: number;
  deleted: number;
  fullResync: boolean;
}

const REVIEWED = new Set(['done', 'partial', 'skipped']);
const CLEARED = { gcalEventId: null, gcalEtag: null, gcalHash: null, gcalSyncedAt: null } as const;

async function fetchAll(
  client: CalendarClient,
  calendarId: string,
  syncToken: string | null,
): Promise<{ items: GEvent[]; nextSyncToken: string | null }> {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const page = await client.listEvents(calendarId, {
      ...(syncToken ? { syncToken } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    items.push(...page.items);
    if (!page.nextPageToken) return { items, nextSyncToken: page.nextSyncToken ?? null };
    pageToken = page.nextPageToken;
  }
}

function findBlock(ctx: Ctx, ev: GEvent): Block | null {
  const byEvent = ctx.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.gcalEventId, ev.id)).get();
  if (byEvent) return getBlock(ctx, byEvent.id);
  const blockId = ev.extendedProperties?.private?.lifeTrackerBlockId;
  if (!blockId) return null;
  const row = ctx.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.id, blockId)).get();
  if (!row) return null;
  const b = getBlock(ctx, row.id);
  // A block that already points at another event is not this event's block.
  return b.gcalEventId && b.gcalEventId !== ev.id ? null : b;
}

function record(ctx: Ctx, blockId: string, kind: 'moved' | 'deleted', before: Block, after?: { start: string; end: string }): void {
  ctx.db
    .insert(googleChanges)
    .values({
      blockId,
      kind,
      beforeStart: before.start,
      beforeEnd: before.end,
      afterStart: after?.start ?? null,
      afterEnd: after?.end ?? null,
      createdAt: ctx.clock.now().toISOString(),
    })
    .run();
}

/** Decision table for an event that no longer exists in Google. */
function applyGoogleDeletion(ctx: Ctx, block: Block, result: PullResult): void {
  if (!block.gcalEventId) return; // echo of our own delete
  if (block.status === 'committed') {
    setGcalFields(ctx, block.id, CLEARED);
    setBlockStatus(ctx, block.id, 'removed');
    record(ctx, block.id, 'deleted', block);
    result.deleted++;
  } else if (REVIEWED.has(block.status) || block.status === 'removed') {
    setGcalFields(ctx, block.id, CLEARED);
  }
}

export async function pullLifeTrackerChanges(ctx: Ctx, client: CalendarClient): Promise<PullResult> {
  const result: PullResult = { moved: 0, deleted: 0, fullResync: false };
  const state = getCalendarState(ctx);
  const calendarId = state.lifeTrackerCalendarId;
  if (!calendarId || state.calendarMissing || ctx.google.needsReconnect()) return result;

  let fetched: { items: GEvent[]; nextSyncToken: string | null };
  let fullList = !state.ltSyncToken;
  try {
    try {
      fetched = await fetchAll(client, calendarId, state.ltSyncToken);
    } catch (err) {
      if (!(err instanceof CalendarApiError) || err.status !== 410 || !state.ltSyncToken) throw err;
      updateCalendarState(ctx, { ltSyncToken: null });
      result.fullResync = true;
      fullList = true;
      fetched = await fetchAll(client, calendarId, null);
    }
  } catch (err) {
    if (err instanceof CalendarApiError && err.status === 401) {
      ctx.google.markNeedsReconnect();
      return result;
    }
    if (err instanceof CalendarApiError && err.status === 404) {
      updateCalendarState(ctx, { calendarMissing: true });
      return result;
    }
    throw err;
  }

  const tz = getTimezone(ctx);
  const origin = appOrigin(ctx);

  ctx.sqlite.transaction((): void => {
    for (const ev of fetched.items) {
      const block = findBlock(ctx, ev);
      if (!block) continue;

      if (ev.status === 'cancelled') {
        applyGoogleDeletion(ctx, block, result);
        continue;
      }

      const evStart = ev.start?.dateTime;
      const evEnd = ev.end?.dateTime;
      if (!evStart || !evEnd) continue; // all-day or malformed: ignored

      // Same etag as our last write: Google has not changed the event since, whatever `updated` says.
      if (block.gcalEventId === ev.id && block.gcalEtag === ev.etag) continue;

      const start = new Date(evStart).toISOString();
      const end = new Date(evEnd).toISOString();

      if (start === block.start && end === block.end) {
        if (block.gcalEtag !== ev.etag || block.gcalEventId !== ev.id) {
          setGcalFields(ctx, block.id, { gcalEventId: ev.id, gcalEtag: ev.etag });
        }
        continue;
      }

      const googleNewer = Date.parse(ev.updated) > Date.parse(block.updatedAt);
      if (googleNewer) {
        if (block.status === 'removed') continue;
        // An unsynced app edit (e.g. a title) must still be pushed: leave the hash empty so the worker doesn't skip it.
        const pending = ctx.db.select({ id: syncQueue.id }).from(syncQueue).where(eq(syncQueue.blockId, block.id)).get();
        const hash = pending ? null : eventHash(toGoogleEvent({ ...block, start, end }, { tz, appOrigin: origin }));
        applyExternalTimes(ctx, block.id, { start, end, gcalEtag: ev.etag, gcalHash: hash });
        if (!block.gcalEventId) setGcalFields(ctx, block.id, { gcalEventId: ev.id });
        record(ctx, block.id, 'moved', block, { start, end });
        result.moved++;
      } else {
        // The app's edit is newer: force a re-push (clearing the hash defeats the worker's skip).
        setGcalFields(ctx, block.id, { gcalHash: null });
        enqueueBlock(ctx, block.id);
      }
    }
    if (fullList) {
      // A full list omits deleted events: any mirrored block whose event was not returned was deleted in Google.
      const seen = new Set(fetched.items.map((e) => e.id));
      const linked = ctx.db.select({ id: blocks.id, ev: blocks.gcalEventId }).from(blocks).where(isNotNull(blocks.gcalEventId)).all();
      for (const l of linked) {
        if (l.ev && !seen.has(l.ev)) applyGoogleDeletion(ctx, getBlock(ctx, l.id), result);
      }
    }
    updateCalendarState(ctx, { ltSyncToken: fetched.nextSyncToken, lastSyncAt: ctx.clock.now().toISOString() });
  })();

  return result;
}

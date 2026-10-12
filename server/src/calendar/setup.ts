import { gt } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { blocks } from '../db/schema.js';
import { getTimezone } from '../domains/settings/service.js';
import type { CalendarClient } from './client.js';
import { enqueueFutureMirrored } from './enqueue.js';
import { getCalendarState, updateCalendarState } from './state.js';

const CALENDAR_NAME = 'Life Tracker';

/** First-connect setup: creates the Life Tracker calendar and picks the primary one as busy. Idempotent. */
export async function ensureCalendarSetup(ctx: Ctx, client: CalendarClient): Promise<void> {
  const state = getCalendarState(ctx);
  if (!state.lifeTrackerCalendarId) {
    const { id } = await client.createCalendar(CALENDAR_NAME, getTimezone(ctx));
    updateCalendarState(ctx, { lifeTrackerCalendarId: id, calendarMissing: false });
  }
  if (state.busyCalendarIds.length === 0) {
    const primary = (await client.listCalendars()).find((c) => c.primary);
    if (primary) updateCalendarState(ctx, { busyCalendarIds: [primary.id] });
  }
  enqueueFutureMirrored(ctx);
}

/** Creates a fresh calendar after the old one was deleted, forgetting all future event links. */
export async function recreateCalendar(ctx: Ctx, client: CalendarClient): Promise<void> {
  const { id } = await client.createCalendar(CALENDAR_NAME, getTimezone(ctx));
  updateCalendarState(ctx, { lifeTrackerCalendarId: id, calendarMissing: false, ltSyncToken: null });
  ctx.db
    .update(blocks)
    .set({ gcalEventId: null, gcalEtag: null, gcalHash: null, gcalSyncedAt: null })
    .where(gt(blocks.end, ctx.clock.now().toISOString()))
    .run();
  enqueueFutureMirrored(ctx);
}

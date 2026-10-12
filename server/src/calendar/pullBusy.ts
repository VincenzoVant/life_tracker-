import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { addDays, zonedToUtc } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { busyEvents } from '../db/schema.js';
import { getTimezone } from '../domains/settings/service.js';
import { CalendarApiError, type CalendarClient, type GEvent } from './client.js';
import { getCalendarState } from './state.js';

export interface BusyEventRow {
  calendarId: string;
  eventId: string;
  title: string;
  start: string;
  end: string;
  updated: string;
}

const DAY_MS = 86_400_000;
const isAllDay = (e: GEvent): boolean => !e.start?.dateTime && !!e.start?.date;

/** Whether an event blocks time: confirmed/tentative, opaque, not declined, timed (or all-day when included). */
export function isBusyEvent(e: GEvent, includeAllDay: boolean): boolean {
  if (e.status === 'cancelled') return false;
  if (e.transparency === 'transparent') return false;
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return false;
  if (isAllDay(e)) return includeAllDay && !!e.end?.date;
  return !!e.start?.dateTime && !!e.end?.dateTime;
}

function toRow(calendarId: string, e: GEvent, tz: string): BusyEventRow {
  const title = e.summary?.trim() || 'Busy';
  if (isAllDay(e)) {
    // Google's all-day end date is exclusive, so each covered date is local 00:00..24:00.
    const endDate = e.end?.date ?? addDays(e.start!.date!, 1);
    return {
      calendarId,
      eventId: e.id,
      title,
      start: zonedToUtc(e.start!.date!, '00:00', tz).toISOString(),
      end: zonedToUtc(endDate, '00:00', tz).toISOString(),
      updated: e.updated,
    };
  }
  return {
    calendarId,
    eventId: e.id,
    title,
    start: new Date(e.start!.dateTime!).toISOString(),
    end: new Date(e.end!.dateTime!).toISOString(),
    updated: e.updated,
  };
}

async function fetchWindow(client: CalendarClient, calendarId: string, timeMin: string, timeMax: string): Promise<GEvent[]> {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const page = await client.listEvents(calendarId, {
      timeMin,
      timeMax,
      singleEvents: true,
      ...(pageToken ? { pageToken } : {}),
    });
    items.push(...page.items);
    if (!page.nextPageToken) return items;
    pageToken = page.nextPageToken;
  }
}

type CacheRow = typeof busyEvents.$inferSelect;
const toPublic = (r: CacheRow): BusyEventRow => ({
  calendarId: r.calendarId,
  eventId: r.eventId,
  title: r.title,
  start: r.start,
  end: r.end,
  updated: r.updated,
});

/** Refreshes the local cache of busy events for the selected calendars and reports what changed. */
export async function pullBusyCalendars(
  ctx: Ctx,
  client: CalendarClient,
): Promise<{ changed: BusyEventRow[]; removed: BusyEventRow[] }> {
  const state = getCalendarState(ctx);
  const selected = state.busyCalendarIds.filter((id) => id !== state.lifeTrackerCalendarId);
  const now = ctx.clock.now();
  const timeMin = new Date(now.getTime() - DAY_MS).toISOString();
  const timeMax = new Date(now.getTime() + 56 * DAY_MS).toISOString();
  const tz = getTimezone(ctx);
  const fetchedAt = now.toISOString();
  const changed: BusyEventRow[] = [];
  const removed: BusyEventRow[] = [];

  // Calendars no longer selected (or now excluded) drop out of the cache.
  const stale = ctx.db
    .select()
    .from(busyEvents)
    .where(selected.length > 0 ? notInArray(busyEvents.calendarId, selected) : undefined)
    .all();
  if (stale.length > 0) {
    removed.push(...stale.map(toPublic));
    ctx.db.delete(busyEvents).where(inArray(busyEvents.calendarId, [...new Set(stale.map((r) => r.calendarId))])).run();
  }

  for (const calendarId of selected) {
    let events: GEvent[];
    try {
      events = await fetchWindow(client, calendarId, timeMin, timeMax);
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 404) events = [];
      else throw err;
    }
    const fresh = new Map<string, BusyEventRow>();
    for (const e of events) if (isBusyEvent(e, state.includeAllDay)) fresh.set(e.id, toRow(calendarId, e, tz));

    const cached = new Map(
      ctx.db.select().from(busyEvents).where(eq(busyEvents.calendarId, calendarId)).all().map((r) => [r.eventId, r]),
    );
    ctx.sqlite.transaction((): void => {
      for (const row of fresh.values()) {
        const old = cached.get(row.eventId);
        if (old && old.updated === row.updated && old.start === row.start && old.end === row.end && old.title === row.title) continue;
        ctx.db
          .insert(busyEvents)
          .values({ ...row, fetchedAt })
          .onConflictDoUpdate({ target: [busyEvents.calendarId, busyEvents.eventId], set: { ...row, fetchedAt } })
          .run();
        changed.push(row);
      }
      for (const [eventId, old] of cached) {
        if (fresh.has(eventId)) continue;
        ctx.db.delete(busyEvents).where(and(eq(busyEvents.calendarId, calendarId), eq(busyEvents.eventId, eventId))).run();
        removed.push(toPublic(old));
      }
    })();
  }
  return { changed, removed };
}

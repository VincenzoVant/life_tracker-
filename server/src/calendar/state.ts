import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { calendarState } from '../db/schema.js';

export interface CalendarState {
  lifeTrackerCalendarId: string | null;
  busyCalendarIds: string[];
  includeAllDay: boolean;
  ltSyncToken: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  calendarMissing: boolean;
}

type Row = typeof calendarState.$inferSelect;

const toState = (r: Row): CalendarState => ({
  lifeTrackerCalendarId: r.lifeTrackerCalendarId,
  busyCalendarIds: JSON.parse(r.busyCalendarIds) as string[],
  includeAllDay: r.includeAllDay,
  ltSyncToken: r.ltSyncToken,
  lastSyncAt: r.lastSyncAt,
  lastError: r.lastError,
  calendarMissing: r.calendarMissing,
});

export function getCalendarState(ctx: Ctx): CalendarState {
  ctx.db.insert(calendarState).values({ id: 1 }).onConflictDoNothing().run();
  return toState(ctx.db.select().from(calendarState).where(eq(calendarState.id, 1)).get()!);
}

export function updateCalendarState(ctx: Ctx, patch: Partial<CalendarState>): CalendarState {
  getCalendarState(ctx);
  const set: Partial<Row> = {};
  if (patch.lifeTrackerCalendarId !== undefined) set.lifeTrackerCalendarId = patch.lifeTrackerCalendarId;
  if (patch.busyCalendarIds !== undefined) set.busyCalendarIds = JSON.stringify(patch.busyCalendarIds);
  if (patch.includeAllDay !== undefined) set.includeAllDay = patch.includeAllDay;
  if (patch.ltSyncToken !== undefined) set.ltSyncToken = patch.ltSyncToken;
  if (patch.lastSyncAt !== undefined) set.lastSyncAt = patch.lastSyncAt;
  if (patch.lastError !== undefined) set.lastError = patch.lastError;
  if (patch.calendarMissing !== undefined) set.calendarMissing = patch.calendarMissing;
  if (Object.keys(set).length > 0) ctx.db.update(calendarState).set(set).where(eq(calendarState.id, 1)).run();
  return getCalendarState(ctx);
}

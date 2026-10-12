import { and, asc, gt, lt } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { busyEvents } from '../db/schema.js';
import type { BusyProvider } from '../domains/plans/busy.js';

/** Busy intervals served from the local busy_events cache (no network). */
export function createCachedBusyProvider(ctx: Pick<Ctx, 'db'>): BusyProvider {
  return {
    busyIntervals(from, to) {
      return ctx.db
        .select()
        .from(busyEvents)
        .where(and(lt(busyEvents.start, to.toISOString()), gt(busyEvents.end, from.toISOString())))
        .orderBy(asc(busyEvents.start), asc(busyEvents.eventId))
        .all()
        .map((r) => ({
          start: r.start,
          end: r.end,
          title: r.title,
          calendarId: r.calendarId,
          externalEventId: r.eventId,
        }));
    },
  };
}

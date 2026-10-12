import { eq } from 'drizzle-orm';
import { addDays, isoWeekday, localDateOf, zonedToUtc, type FixedEvent } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { blocks, fixedEvents } from '../../db/schema.js';
import { createBlock, reviveFixedBlockInternal, setBlockStatus, updateFixedBlockInternal } from '../blocks/service.js';
import { getTimezone } from '../settings/service.js';

export const HORIZON_DAYS = 56;

export interface MaterializeResult {
  created: number;
  updated: number;
  removed: number;
}

interface Desired {
  start: string;
  end: string;
}

function desiredOccurrences(ev: FixedEvent, today: string, tz: string): Map<string, Desired> {
  const out = new Map<string, Desired>();
  if (!ev.active) return out;
  const last = addDays(today, HORIZON_DAYS);
  for (let d = today; d <= last; d = addDays(d, 1)) {
    if (isoWeekday(d) !== ev.weekday || d < ev.validFrom || d > ev.validTo) continue;
    out.set(d, {
      start: zonedToUtc(d, ev.startTime, tz).toISOString(),
      end: zonedToUtc(d, ev.endTime, tz).toISOString(),
    });
  }
  return out;
}

/**
 * Rolling window: creates missing occurrences for today..today+56. Only when `fixedEventId` is given (the event was
 * just created/edited) are existing future committed occurrences moved or removed; the daily run never touches them.
 */
export function materializeFixedEvents(ctx: Ctx, opts: { fixedEventId?: string } = {}): MaterializeResult {
  return ctx.db.transaction(() => {
    const result: MaterializeResult = { created: 0, updated: 0, removed: 0 };
    const tz = getTimezone(ctx);
    const now = ctx.clock.now();
    const today = localDateOf(now, tz);
    const nowIso = now.toISOString();

    const events = ctx.db
      .select()
      .from(fixedEvents)
      .where(opts.fixedEventId ? eq(fixedEvents.id, opts.fixedEventId) : undefined)
      .all() as FixedEvent[];

    for (const ev of events) {
      const desired = desiredOccurrences(ev, today, tz);
      const existing = ctx.db.select().from(blocks).where(eq(blocks.fixedEventId, ev.id)).all();

      const dateOf = (b: (typeof existing)[number]): string => b.occurrenceDate ?? localDateOf(new Date(b.start), tz);

      if (opts.fixedEventId) {
        for (const b of existing) {
          if (b.start <= nowIso || b.status !== 'committed') continue;
          const want = desired.get(dateOf(b));
          if (!want) {
            setBlockStatus(ctx, b.id, 'removed', undefined, 'schedule');
            result.removed++;
          } else if (
            want.start !== b.start ||
            want.end !== b.end ||
            ev.title !== b.title ||
            (ev.courseId ?? null) !== b.courseId
          ) {
            updateFixedBlockInternal(ctx, b.id, {
              start: want.start,
              end: want.end,
              title: ev.title,
              courseId: ev.courseId ?? null,
            });
            result.updated++;
          }
        }
      }

      // Re-read: the edit pass may have removed rows, which then count as revivable below.
      const byDate = new Map<string, typeof existing>();
      for (const b of ctx.db.select().from(blocks).where(eq(blocks.fixedEventId, ev.id)).all()) {
        const list = byDate.get(dateOf(b)) ?? [];
        list.push(b);
        byDate.set(dateOf(b), list);
      }
      for (const [date, want] of desired) {
        const rows = byDate.get(date) ?? [];
        const isRevivable = (b: (typeof existing)[number]) => b.status === 'removed' && b.removedBy === 'schedule';
        if (rows.some((b) => !isRevivable(b))) continue; // present, reviewed or user-cancelled
        const values = { start: want.start, end: want.end, title: ev.title, courseId: ev.courseId ?? null };
        const revivable = rows.find(isRevivable);
        if (revivable) {
          reviveFixedBlockInternal(ctx, revivable.id, values);
          result.created++;
          continue;
        }
        createBlock(
          ctx,
          { category: ev.kind === 'class' ? 'study' : 'work', ...values },
          { source: 'fixed', status: 'committed', locked: true, fixedEventId: ev.id, occurrenceDate: date },
        );
        result.created++;
      }
    }
    return result;
  });
}

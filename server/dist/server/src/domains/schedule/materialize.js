import { eq } from 'drizzle-orm';
import { addDays, isoWeekday, localDateOf, zonedToUtc } from '@life-tracker/shared';
import { blocks, fixedEvents } from '../../db/schema.js';
import { createBlock, setBlockStatus, updateFixedBlockInternal } from '../blocks/service.js';
import { getTimezone } from '../settings/service.js';
export const HORIZON_DAYS = 56;
function desiredOccurrences(ev, today, tz) {
    const out = new Map();
    if (!ev.active)
        return out;
    const last = addDays(today, HORIZON_DAYS);
    for (let d = today; d <= last; d = addDays(d, 1)) {
        if (isoWeekday(d) !== ev.weekday || d < ev.validFrom || d > ev.validTo)
            continue;
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
export function materializeFixedEvents(ctx, opts = {}) {
    return ctx.db.transaction(() => {
        const result = { created: 0, updated: 0, removed: 0 };
        const tz = getTimezone(ctx);
        const now = ctx.clock.now();
        const today = localDateOf(now, tz);
        const nowIso = now.toISOString();
        const events = ctx.db
            .select()
            .from(fixedEvents)
            .where(opts.fixedEventId ? eq(fixedEvents.id, opts.fixedEventId) : undefined)
            .all();
        for (const ev of events) {
            const desired = desiredOccurrences(ev, today, tz);
            const existing = ctx.db.select().from(blocks).where(eq(blocks.fixedEventId, ev.id)).all();
            if (opts.fixedEventId) {
                for (const b of existing) {
                    if (b.start <= nowIso || b.status !== 'committed')
                        continue;
                    const want = desired.get(localDateOf(new Date(b.start), tz));
                    if (!want) {
                        setBlockStatus(ctx, b.id, 'removed');
                        result.removed++;
                    }
                    else if (want.start !== b.start ||
                        want.end !== b.end ||
                        ev.title !== b.title ||
                        (ev.courseId ?? null) !== b.courseId) {
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
            const taken = new Set(existing.map((b) => localDateOf(new Date(b.start), tz)));
            for (const [date, want] of desired) {
                if (taken.has(date))
                    continue;
                createBlock(ctx, {
                    category: ev.kind === 'class' ? 'study' : 'work',
                    title: ev.title,
                    start: want.start,
                    end: want.end,
                    courseId: ev.courseId ?? null,
                }, { source: 'fixed', status: 'committed', locked: true, fixedEventId: ev.id });
                result.created++;
            }
        }
        return result;
    });
}

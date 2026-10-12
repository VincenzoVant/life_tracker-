import { and, asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type { Block, Conflict, ConflictStatus } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { blocks, conflicts } from '../db/schema.js';
import { getBlock } from '../domains/blocks/service.js';
import { notFound } from '../lib/errors.js';
import type { BusyEventRow } from './pullBusy.js';

type Row = typeof conflicts.$inferSelect;

function toConflict(ctx: Ctx, r: Row): Conflict {
  const ids = JSON.parse(r.blockIds) as string[];
  const found: Block[] = [];
  for (const id of ids) {
    try {
      found.push(getBlock(ctx, id));
    } catch {
      /* block deleted since */
    }
  }
  return {
    id: r.id,
    calendarId: r.calendarId,
    externalEventId: r.externalEventId,
    title: r.title,
    start: r.start,
    end: r.end,
    status: r.status as ConflictStatus,
    blocks: found,
  };
}

function find(ctx: Ctx, calendarId: string, eventId: string): Row | undefined {
  return ctx.db
    .select()
    .from(conflicts)
    .where(and(eq(conflicts.calendarId, calendarId), eq(conflicts.externalEventId, eventId)))
    .get();
}

function setStatus(ctx: Ctx, id: number, status: ConflictStatus): Conflict {
  const res = ctx.db
    .update(conflicts)
    .set({ status, updatedAt: ctx.clock.now().toISOString() })
    .where(eq(conflicts.id, id))
    .returning()
    .get();
  if (!res) throw notFound('Conflict');
  return toConflict(ctx, res);
}

/** Future, unlocked, committed, non-review blocks that overlap the event (no buffer). */
function overlappingBlockIds(ctx: Ctx, ev: BusyEventRow): string[] {
  return ctx.db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        lt(blocks.start, ev.end),
        gt(blocks.end, ev.start),
        gt(blocks.start, ctx.clock.now().toISOString()),
        eq(blocks.status, 'committed'),
        eq(blocks.locked, false),
        ne(blocks.source, 'unplanned'),
      ),
    )
    .orderBy(asc(blocks.start), asc(blocks.id))
    .all()
    .map((b) => b.id);
}

export function detectConflicts(
  ctx: Ctx,
  changes: { changed: BusyEventRow[]; removed: BusyEventRow[] },
): { opened: number; resolved: number } {
  let opened = 0;
  let resolved = 0;
  const now = ctx.clock.now().toISOString();

  ctx.sqlite.transaction((): void => {
    for (const ev of changes.changed) {
      const ids = overlappingBlockIds(ctx, ev);
      const existing = find(ctx, ev.calendarId, ev.eventId);
      if (ids.length > 0) {
        const fields = { title: ev.title, start: ev.start, end: ev.end, blockIds: JSON.stringify(ids), status: 'open', updatedAt: now };
        const moved = !existing || existing.title !== ev.title || existing.start !== ev.start || existing.end !== ev.end;
        if (existing && existing.status !== 'open' && !moved) continue; // dismissed/replanned stays so until the event really changes
        if (!existing) {
          ctx.db.insert(conflicts).values({ calendarId: ev.calendarId, externalEventId: ev.eventId, createdAt: now, ...fields }).run();
          opened++;
        } else {
          if (existing.status !== 'open') opened++; // the event changed again: reopen a dismissed or replanned conflict
          ctx.db.update(conflicts).set(fields).where(eq(conflicts.id, existing.id)).run();
        }
      } else if (existing?.status === 'open') {
        ctx.db.update(conflicts).set({ status: 'dismissed', updatedAt: now }).where(eq(conflicts.id, existing.id)).run();
        resolved++;
      }
    }
    for (const ev of changes.removed) {
      const existing = find(ctx, ev.calendarId, ev.eventId);
      if (existing?.status === 'open') {
        ctx.db.update(conflicts).set({ status: 'dismissed', updatedAt: now }).where(eq(conflicts.id, existing.id)).run();
        resolved++;
      }
    }
  })();
  return { opened, resolved };
}

export function listConflicts(ctx: Ctx, status: 'open'): Conflict[] {
  return ctx.db
    .select()
    .from(conflicts)
    .where(inArray(conflicts.status, [status]))
    .orderBy(asc(conflicts.start), asc(conflicts.id))
    .all()
    .map((r) => toConflict(ctx, r));
}

export function dismissConflict(ctx: Ctx, id: number): Conflict {
  return setStatus(ctx, id, 'dismissed');
}

/** Used by the replan flow once the user accepted a replan for this conflict. */
export function markConflictReplanned(ctx: Ctx, id: number): Conflict {
  return setStatus(ctx, id, 'replanned');
}

import { and, asc, eq, gt } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  FixedEventInput,
  type FixedEvent,
  type FixedEventUpdateInput,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { blocks, fixedEvents } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { assertLinksExist, setBlockStatus } from '../blocks/service.js';
import { materializeFixedEvents } from './materialize.js';

type Row = typeof fixedEvents.$inferSelect;

const toEvent = (r: Row): FixedEvent => ({
  id: r.id,
  title: r.title,
  kind: r.kind as FixedEvent['kind'],
  courseId: r.courseId,
  weekday: r.weekday as FixedEvent['weekday'],
  startTime: r.startTime,
  endTime: r.endTime,
  validFrom: r.validFrom,
  validTo: r.validTo,
  active: r.active,
  bufferBefore: r.bufferBefore,
  bufferAfter: r.bufferAfter,
});

export function listFixedEvents(ctx: Ctx): FixedEvent[] {
  return ctx.db
    .select()
    .from(fixedEvents)
    .orderBy(asc(fixedEvents.weekday), asc(fixedEvents.startTime), asc(fixedEvents.id))
    .all()
    .map(toEvent);
}

function getRow(ctx: Ctx, id: string): Row {
  const row = ctx.db.select().from(fixedEvents).where(eq(fixedEvents.id, id)).get();
  if (!row) throw notFound('Fixed event');
  return row;
}

export function createFixedEvent(ctx: Ctx, input: unknown): FixedEvent {
  const v = parse(FixedEventInput, input);
  assertLinksExist(ctx, v);
  const now = ctx.clock.now().toISOString();
  const id = ulid();
  return ctx.db.transaction(() => {
    ctx.db
      .insert(fixedEvents)
      .values({
        id,
        title: v.title,
        kind: v.kind,
        courseId: v.courseId ?? null,
        weekday: v.weekday,
        startTime: v.startTime,
        endTime: v.endTime,
        validFrom: v.validFrom,
        validTo: v.validTo,
        active: v.active,
        bufferBefore: v.bufferBefore,
        bufferAfter: v.bufferAfter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    materializeFixedEvents(ctx, { fixedEventId: id });
    return toEvent(getRow(ctx, id));
  });
}

export function updateFixedEvent(ctx: Ctx, id: string, patch: FixedEventUpdateInput): FixedEvent {
  const cur = toEvent(getRow(ctx, id));
  const v = parse(FixedEventInput, { ...cur, ...patch });
  assertLinksExist(ctx, { courseId: v.courseId !== cur.courseId ? v.courseId : null });
  return ctx.db.transaction(() => {
    ctx.db
      .update(fixedEvents)
      .set({
        title: v.title,
        kind: v.kind,
        courseId: v.courseId ?? null,
        weekday: v.weekday,
        startTime: v.startTime,
        endTime: v.endTime,
        validFrom: v.validFrom,
        validTo: v.validTo,
        active: v.active,
        bufferBefore: v.bufferBefore,
        bufferAfter: v.bufferAfter,
        updatedAt: ctx.clock.now().toISOString(),
      })
      .where(eq(fixedEvents.id, id))
      .run();
    materializeFixedEvents(ctx, { fixedEventId: id });
    return toEvent(getRow(ctx, id));
  });
}

/** Future committed occurrences become `removed`; past blocks keep their (now dangling) fixedEventId. */
export function deleteFixedEvent(ctx: Ctx, id: string): void {
  getRow(ctx, id);
  ctx.db.transaction(() => {
    const future = ctx.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        and(
          eq(blocks.fixedEventId, id),
          eq(blocks.status, 'committed'),
          gt(blocks.start, ctx.clock.now().toISOString()),
        ),
      )
      .all();
    for (const b of future) setBlockStatus(ctx, b.id, 'removed', undefined, 'schedule');
    ctx.db.delete(fixedEvents).where(eq(fixedEvents.id, id)).run();
  });
}

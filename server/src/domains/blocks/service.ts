import { and, asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  BlockCreateInput,
  blockMinutes,
  type Block,
  type BlockSource,
  type BlockStatus,
  type BlockUpdateInput,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { blocks, courses, startupTasks } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { canTransition } from './status.js';

type Row = typeof blocks.$inferSelect;

function toBlock(r: Row): Block {
  return r as Block;
}

const normIso = (s: string): string => new Date(s).toISOString();

/** Checks that referenced courses / startup tasks exist (archived courses are still valid links). */
export function assertLinksExist(ctx: Ctx, links: { courseId?: string | null; startupTaskId?: string | null }): void {
  const fields: Record<string, string> = {};
  if (links.courseId && !ctx.db.select({ id: courses.id }).from(courses).where(eq(courses.id, links.courseId)).get()) {
    fields.courseId = 'Unknown course';
  }
  if (
    links.startupTaskId &&
    !ctx.db.select({ id: startupTasks.id }).from(startupTasks).where(eq(startupTasks.id, links.startupTaskId)).get()
  ) {
    fields.startupTaskId = 'Unknown task';
  }
  if (Object.keys(fields).length > 0) throw new AppError('VALIDATION', 'Invalid input', fields);
}

export function listBlocks(ctx: Ctx, q: { from: Date; to: Date; includeRemoved?: boolean }): Block[] {
  const conds = [lt(blocks.start, q.to.toISOString()), gt(blocks.end, q.from.toISOString())];
  if (!q.includeRemoved) conds.push(ne(blocks.status, 'removed'));
  return ctx.db
    .select()
    .from(blocks)
    .where(and(...conds))
    .orderBy(asc(blocks.start), asc(blocks.id))
    .all()
    .map(toBlock);
}

export function getBlock(ctx: Ctx, id: string): Block {
  const row = ctx.db.select().from(blocks).where(eq(blocks.id, id)).get();
  if (!row) throw notFound('Block');
  return toBlock(row);
}

export interface CreateBlockOpts {
  source?: BlockSource;
  status?: BlockStatus;
  locked?: boolean;
  planId?: string | null;
  fixedEventId?: string | null;
  occurrenceDate?: string | null;
  actualMinutes?: number | null;
}

export function createBlock(ctx: Ctx, input: BlockCreateInput, opts: CreateBlockOpts = {}): Block {
  const v = parse(BlockCreateInput, input);
  assertLinksExist(ctx, v);
  const now = ctx.clock.now().toISOString();
  const row: Row = {
    id: ulid(),
    category: v.category,
    title: v.title,
    start: normIso(v.start),
    end: normIso(v.end),
    status: opts.status ?? 'committed',
    actualMinutes: opts.actualMinutes ?? null,
    source: opts.source ?? 'manual',
    locked: opts.locked ?? false,
    courseId: v.courseId ?? null,
    startupTaskId: v.startupTaskId ?? null,
    workoutType: v.workoutType ?? null,
    mealSlot: v.mealSlot ?? null,
    fixedEventId: opts.fixedEventId ?? null,
    occurrenceDate: opts.occurrenceDate ?? null,
    removedBy: null,
    planId: opts.planId ?? null,
    gcalEventId: null,
    gcalEtag: null,
    gcalSyncedAt: null,
    gcalHash: null,
    notes: v.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  ctx.db.insert(blocks).values(row).run();
  ctx.events.emit({ blockId: row.id, kind: 'created' });
  return toBlock(row);
}

export function updateBlock(ctx: Ctx, id: string, patch: BlockUpdateInput): Block {
  const cur = getBlock(ctx, id);
  if (cur.status === 'removed') throw new AppError('INVALID_TRANSITION', 'A removed block cannot be edited');

  const merged = {
    category: patch.category ?? cur.category,
    title: patch.title ?? cur.title,
    start: patch.start ?? cur.start,
    end: patch.end ?? cur.end,
    courseId: patch.courseId !== undefined ? patch.courseId : cur.courseId,
    startupTaskId: patch.startupTaskId !== undefined ? patch.startupTaskId : cur.startupTaskId,
    workoutType: patch.workoutType !== undefined ? patch.workoutType : cur.workoutType,
    mealSlot: patch.mealSlot !== undefined ? patch.mealSlot : cur.mealSlot,
    notes: patch.notes !== undefined ? patch.notes : cur.notes,
  };

  if (
    cur.source === 'fixed' &&
    (merged.category !== cur.category || normIso(merged.start) !== cur.start || normIso(merged.end) !== cur.end)
  ) {
    throw new AppError('CONFLICT', 'Fixed blocks cannot change time or category');
  }

  const v = parse(BlockCreateInput, merged);
  // Only re-check links that are being changed, so existing links never block unrelated edits.
  assertLinksExist(ctx, {
    courseId: v.courseId !== cur.courseId ? v.courseId : null,
    startupTaskId: v.startupTaskId !== cur.startupTaskId ? v.startupTaskId : null,
  });

  const next = {
    category: v.category,
    title: v.title,
    start: normIso(v.start),
    end: normIso(v.end),
    courseId: v.courseId ?? null,
    startupTaskId: v.startupTaskId ?? null,
    workoutType: v.workoutType ?? null,
    mealSlot: v.mealSlot ?? null,
    notes: v.notes ?? null,
    updatedAt: ctx.clock.now().toISOString(),
  };
  ctx.db.update(blocks).set(next).where(eq(blocks.id, id)).run();
  ctx.events.emit({ blockId: id, kind: 'updated' });
  return getBlock(ctx, id);
}

export function setBlockStatus(
  ctx: Ctx,
  id: string,
  to: BlockStatus,
  actualMinutes?: number | null,
  removedBy: 'user' | 'schedule' = 'user',
): Block {
  const cur = getBlock(ctx, id);
  if (!canTransition(cur.status, to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot change a ${cur.status} block to ${to}`);
  }
  let minutes: number | null = cur.actualMinutes;
  if (actualMinutes !== undefined) minutes = actualMinutes;
  else if (to === 'done') minutes = blockMinutes(cur);
  else if (to === 'skipped') minutes = 0;
  ctx.db
    .update(blocks)
    .set({
      status: to,
      actualMinutes: minutes,
      removedBy: to === 'removed' ? removedBy : null,
      updatedAt: ctx.clock.now().toISOString(),
    })
    .where(eq(blocks.id, id))
    .run();
  ctx.events.emit({ blockId: id, kind: to === 'removed' ? 'removed' : 'updated' });
  return getBlock(ctx, id);
}

/** Schedule materialization only: brings a schedule-removed fixed block back to committed with the given times. */
export function reviveFixedBlockInternal(
  ctx: Ctx,
  id: string,
  v: { start: string; end: string; title: string; courseId: string | null },
): Block {
  const cur = getBlock(ctx, id);
  if (cur.source !== 'fixed' || cur.status !== 'removed' || cur.removedBy !== 'schedule') {
    throw new AppError('CONFLICT', 'Only schedule-removed fixed blocks can be revived');
  }
  ctx.db
    .update(blocks)
    .set({
      status: 'committed',
      removedBy: null,
      actualMinutes: null,
      start: normIso(v.start),
      end: normIso(v.end),
      title: v.title,
      courseId: v.courseId,
      updatedAt: ctx.clock.now().toISOString(),
    })
    .where(eq(blocks.id, id))
    .run();
  ctx.events.emit({ blockId: id, kind: 'updated' });
  return getBlock(ctx, id);
}

/** For schedule materialization only: moves/renames a `source = 'fixed'` block, bypassing the fixed-time guard. */
export function updateFixedBlockInternal(
  ctx: Ctx,
  id: string,
  patch: { start?: string; end?: string; title?: string; courseId?: string | null },
): Block {
  const cur = getBlock(ctx, id);
  if (cur.source !== 'fixed') throw new AppError('CONFLICT', 'Only fixed blocks can be updated this way');
  if (cur.status === 'removed') throw new AppError('INVALID_TRANSITION', 'A removed block cannot be edited');
  const next = {
    title: patch.title ?? cur.title,
    start: patch.start !== undefined ? normIso(patch.start) : cur.start,
    end: patch.end !== undefined ? normIso(patch.end) : cur.end,
    courseId: patch.courseId !== undefined ? patch.courseId : cur.courseId,
  };
  assertLinksExist(ctx, { courseId: next.courseId !== cur.courseId ? next.courseId : null });
  ctx.db
    .update(blocks)
    .set({ ...next, updatedAt: ctx.clock.now().toISOString() })
    .where(eq(blocks.id, id))
    .run();
  ctx.events.emit({ blockId: id, kind: 'updated' });
  return getBlock(ctx, id);
}

/** Hard delete; proposed blocks never reach Google, so nothing is emitted. */
export function deleteProposedBlocks(ctx: Ctx, ids: string[]): void {
  if (ids.length === 0) return;
  ctx.db.delete(blocks).where(and(inArray(blocks.id, ids), eq(blocks.status, 'proposed'))).run();
}

export interface GcalFields {
  gcalEventId?: string | null;
  gcalEtag?: string | null;
  gcalHash?: string | null;
  gcalSyncedAt?: string | null;
}

/** Records Google bookkeeping on a block. Does not emit and does not touch `updatedAt`. */
export function setGcalFields(ctx: Ctx, blockId: string, f: GcalFields): void {
  const set: GcalFields = {};
  if (f.gcalEventId !== undefined) set.gcalEventId = f.gcalEventId;
  if (f.gcalEtag !== undefined) set.gcalEtag = f.gcalEtag;
  if (f.gcalHash !== undefined) set.gcalHash = f.gcalHash;
  if (f.gcalSyncedAt !== undefined) set.gcalSyncedAt = f.gcalSyncedAt;
  if (Object.keys(set).length === 0) return;
  ctx.db.update(blocks).set(set).where(eq(blocks.id, blockId)).run();
}

/** Applies a time change that originated in Google. Does not emit, so no echo write is queued. */
export function applyExternalTimes(
  ctx: Ctx,
  blockId: string,
  f: { start: string; end: string; gcalEtag: string; gcalHash: string },
): void {
  ctx.db
    .update(blocks)
    .set({
      start: normIso(f.start),
      end: normIso(f.end),
      gcalEtag: f.gcalEtag,
      gcalHash: f.gcalHash,
      gcalSyncedAt: ctx.clock.now().toISOString(),
      updatedAt: ctx.clock.now().toISOString(),
    })
    .where(eq(blocks.id, blockId))
    .run();
}

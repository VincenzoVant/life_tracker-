import { and, asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { ulid } from 'ulid';
import { BlockCreateInput, blockMinutes, } from '@life-tracker/shared';
import { blocks, courses, startupTasks } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { canTransition } from './status.js';
function toBlock(r) {
    return r;
}
const normIso = (s) => new Date(s).toISOString();
/** Checks that referenced courses / startup tasks exist (archived courses are still valid links). */
export function assertLinksExist(ctx, links) {
    const fields = {};
    if (links.courseId && !ctx.db.select({ id: courses.id }).from(courses).where(eq(courses.id, links.courseId)).get()) {
        fields.courseId = 'Unknown course';
    }
    if (links.startupTaskId &&
        !ctx.db.select({ id: startupTasks.id }).from(startupTasks).where(eq(startupTasks.id, links.startupTaskId)).get()) {
        fields.startupTaskId = 'Unknown task';
    }
    if (Object.keys(fields).length > 0)
        throw new AppError('VALIDATION', 'Invalid input', fields);
}
export function listBlocks(ctx, q) {
    const conds = [lt(blocks.start, q.to.toISOString()), gt(blocks.end, q.from.toISOString())];
    if (!q.includeRemoved)
        conds.push(ne(blocks.status, 'removed'));
    return ctx.db
        .select()
        .from(blocks)
        .where(and(...conds))
        .orderBy(asc(blocks.start), asc(blocks.id))
        .all()
        .map(toBlock);
}
export function getBlock(ctx, id) {
    const row = ctx.db.select().from(blocks).where(eq(blocks.id, id)).get();
    if (!row)
        throw notFound('Block');
    return toBlock(row);
}
export function createBlock(ctx, input, opts = {}) {
    const v = parse(BlockCreateInput, input);
    assertLinksExist(ctx, v);
    const now = ctx.clock.now().toISOString();
    const row = {
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
        planId: opts.planId ?? null,
        gcalEventId: null,
        gcalEtag: null,
        gcalSyncedAt: null,
        notes: v.notes ?? null,
        createdAt: now,
        updatedAt: now,
    };
    ctx.db.insert(blocks).values(row).run();
    ctx.events.emit({ blockId: row.id, kind: 'created' });
    return toBlock(row);
}
export function updateBlock(ctx, id, patch) {
    const cur = getBlock(ctx, id);
    if (cur.status === 'removed')
        throw new AppError('INVALID_TRANSITION', 'A removed block cannot be edited');
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
    if (cur.source === 'fixed' &&
        (merged.category !== cur.category || normIso(merged.start) !== cur.start || normIso(merged.end) !== cur.end)) {
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
export function setBlockStatus(ctx, id, to, actualMinutes) {
    const cur = getBlock(ctx, id);
    if (!canTransition(cur.status, to)) {
        throw new AppError('INVALID_TRANSITION', `Cannot change a ${cur.status} block to ${to}`);
    }
    let minutes = cur.actualMinutes;
    if (actualMinutes !== undefined)
        minutes = actualMinutes;
    else if (to === 'done')
        minutes = blockMinutes(cur);
    else if (to === 'skipped')
        minutes = 0;
    ctx.db
        .update(blocks)
        .set({ status: to, actualMinutes: minutes, updatedAt: ctx.clock.now().toISOString() })
        .where(eq(blocks.id, id))
        .run();
    ctx.events.emit({ blockId: id, kind: to === 'removed' ? 'removed' : 'updated' });
    return getBlock(ctx, id);
}
/** For schedule materialization only: moves/renames a `source = 'fixed'` block, bypassing the fixed-time guard. */
export function updateFixedBlockInternal(ctx, id, patch) {
    const cur = getBlock(ctx, id);
    if (cur.source !== 'fixed')
        throw new AppError('CONFLICT', 'Only fixed blocks can be updated this way');
    if (cur.status === 'removed')
        throw new AppError('INVALID_TRANSITION', 'A removed block cannot be edited');
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
export function deleteProposedBlocks(ctx, ids) {
    if (ids.length === 0)
        return;
    ctx.db.delete(blocks).where(and(inArray(blocks.id, ids), eq(blocks.status, 'proposed'))).run();
}

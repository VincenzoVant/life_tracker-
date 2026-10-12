import { asc, eq, max, ne } from 'drizzle-orm';
import { ulid } from 'ulid';
import { MilestoneInput, MilestoneUpdateInput, TaskInput, TaskUpdateInput, } from '@life-tracker/shared';
import { startupMilestones, startupTasks } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
const toTask = (r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    milestoneId: r.milestoneId,
    sortOrder: r.sortOrder,
    doneAt: r.doneAt,
});
const toMilestone = (r) => ({
    id: r.id,
    title: r.title,
    targetDate: r.targetDate,
    doneAt: r.doneAt,
    sortOrder: r.sortOrder,
});
function assertMilestoneExists(ctx, id) {
    if (!id)
        return;
    const row = ctx.db.select({ id: startupMilestones.id }).from(startupMilestones).where(eq(startupMilestones.id, id)).get();
    if (!row)
        throw new AppError('VALIDATION', 'Invalid input', { milestoneId: 'Unknown milestone' });
}
// ---- tasks ----
export function listTasks(ctx, opts = {}) {
    const q = ctx.db.select().from(startupTasks);
    const rows = (opts.status ? q.where(eq(startupTasks.status, opts.status)) : q)
        .orderBy(asc(startupTasks.sortOrder), asc(startupTasks.id))
        .all();
    return rows.map(toTask);
}
/** Tasks that are not done, in manual order (the Stage 2 planner reads this). */
export function listOpenTasks(ctx) {
    return ctx.db
        .select()
        .from(startupTasks)
        .where(ne(startupTasks.status, 'done'))
        .orderBy(asc(startupTasks.sortOrder), asc(startupTasks.id))
        .all()
        .map(toTask);
}
function getTaskRow(ctx, id) {
    const row = ctx.db.select().from(startupTasks).where(eq(startupTasks.id, id)).get();
    if (!row)
        throw notFound('Task');
    return row;
}
export function createTask(ctx, input) {
    const v = parse(TaskInput, input);
    assertMilestoneExists(ctx, v.milestoneId);
    const now = ctx.clock.now().toISOString();
    const top = ctx.db.select({ m: max(startupTasks.sortOrder) }).from(startupTasks).get()?.m;
    const status = v.status ?? 'todo';
    const row = {
        id: ulid(),
        title: v.title,
        status,
        milestoneId: v.milestoneId ?? null,
        sortOrder: top === null || top === undefined ? 0 : top + 1,
        doneAt: status === 'done' ? now : null,
        createdAt: now,
        updatedAt: now,
    };
    ctx.db.insert(startupTasks).values(row).run();
    return toTask(row);
}
export function updateTask(ctx, id, input) {
    const patch = parse(TaskUpdateInput, input);
    const cur = getTaskRow(ctx, id);
    if (patch.milestoneId !== undefined)
        assertMilestoneExists(ctx, patch.milestoneId);
    const now = ctx.clock.now().toISOString();
    const status = patch.status ?? cur.status;
    let doneAt = cur.doneAt;
    if (status === 'done' && cur.status !== 'done')
        doneAt = now;
    else if (status !== 'done')
        doneAt = null;
    const next = {
        ...cur,
        title: patch.title ?? cur.title,
        milestoneId: patch.milestoneId !== undefined ? patch.milestoneId : cur.milestoneId,
        status,
        doneAt,
        updatedAt: now,
    };
    ctx.db.update(startupTasks).set(next).where(eq(startupTasks.id, id)).run();
    return toTask(next);
}
/** Linked blocks keep their history; the FK sets their startupTaskId to null. */
export function deleteTask(ctx, id) {
    const cur = getTaskRow(ctx, id);
    ctx.db.delete(startupTasks).where(eq(startupTasks.id, id)).run();
    return toTask(cur);
}
export function reorderTasks(ctx, ids) {
    const all = ctx.db.select({ id: startupTasks.id }).from(startupTasks).all().map((r) => r.id);
    const known = new Set(all);
    if (ids.length !== all.length || new Set(ids).size !== ids.length || !ids.every((i) => known.has(i))) {
        throw new AppError('VALIDATION', 'ids must list every task exactly once', { ids: 'Must be a permutation of all task ids' });
    }
    ctx.db.transaction((tx) => {
        ids.forEach((taskId, i) => tx.update(startupTasks).set({ sortOrder: i }).where(eq(startupTasks.id, taskId)).run());
    });
    return listTasks(ctx);
}
// ---- milestones ----
export function listMilestones(ctx) {
    return ctx.db
        .select()
        .from(startupMilestones)
        .orderBy(asc(startupMilestones.sortOrder), asc(startupMilestones.id))
        .all()
        .map(toMilestone);
}
function getMilestoneRow(ctx, id) {
    const row = ctx.db.select().from(startupMilestones).where(eq(startupMilestones.id, id)).get();
    if (!row)
        throw notFound('Milestone');
    return row;
}
export function createMilestone(ctx, input) {
    const v = parse(MilestoneInput, input);
    const now = ctx.clock.now().toISOString();
    const top = ctx.db.select({ m: max(startupMilestones.sortOrder) }).from(startupMilestones).get()?.m;
    const row = {
        id: ulid(),
        title: v.title,
        targetDate: v.targetDate ?? null,
        doneAt: v.done ? now : null,
        sortOrder: top === null || top === undefined ? 0 : top + 1,
        createdAt: now,
        updatedAt: now,
    };
    ctx.db.insert(startupMilestones).values(row).run();
    return toMilestone(row);
}
export function updateMilestone(ctx, id, input) {
    const patch = parse(MilestoneUpdateInput, input);
    const cur = getMilestoneRow(ctx, id);
    const now = ctx.clock.now().toISOString();
    let doneAt = cur.doneAt;
    if (patch.done === true && !cur.doneAt)
        doneAt = now;
    else if (patch.done === false)
        doneAt = null;
    const next = {
        ...cur,
        title: patch.title ?? cur.title,
        targetDate: patch.targetDate !== undefined ? patch.targetDate : cur.targetDate,
        doneAt,
        updatedAt: now,
    };
    ctx.db.update(startupMilestones).set(next).where(eq(startupMilestones.id, id)).run();
    return toMilestone(next);
}
/** Tasks in the milestone keep existing with milestoneId set to null by the FK. */
export function deleteMilestone(ctx, id) {
    const cur = getMilestoneRow(ctx, id);
    ctx.db.delete(startupMilestones).where(eq(startupMilestones.id, id)).run();
    return toMilestone(cur);
}

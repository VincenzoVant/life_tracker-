import { and, asc, desc, eq, gte, lte, max } from 'drizzle-orm';
import { ulid } from 'ulid';
import { LiftInput, SessionInput, SessionListQuery, SessionUpdateInput, TopSetInput, WorkoutDetails, localDateOf, } from '@life-tracker/shared';
import { lifts, topSets, workoutSessions } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { getTimezone } from '../settings/service.js';
import { computePRs } from './prs.js';
const toSession = (r) => ({
    id: r.id,
    blockId: r.blockId,
    type: r.type,
    date: r.date,
    durationMinutes: r.durationMinutes,
    intensity: r.intensity,
    notes: r.notes,
    gymFocus: r.gymFocus,
    cardioKind: r.cardioKind,
    distanceKm: r.distanceKm,
    sportName: r.sportName,
    paceSecPerKm: r.type === 'cardio' && r.distanceKm ? Math.round((r.durationMinutes * 60) / r.distanceKm) : null,
});
const toLift = (r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder });
const toSet = (r) => ({
    id: r.id,
    liftId: r.liftId,
    date: r.date,
    weightKg: r.weightKg,
    reps: r.reps,
    notes: r.notes,
});
// ---- sessions ----
export function listSessions(ctx, query) {
    const q = parse(SessionListQuery, query);
    return ctx.db
        .select()
        .from(workoutSessions)
        .where(and(gte(workoutSessions.date, q.from), lte(workoutSessions.date, q.to)))
        .orderBy(asc(workoutSessions.date), asc(workoutSessions.id))
        .all()
        .map(toSession);
}
function getSessionRow(ctx, id) {
    const row = ctx.db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
    if (!row)
        throw notFound('Workout session');
    return row;
}
export function createSession(ctx, input) {
    const v = parse(SessionInput, input);
    const now = ctx.clock.now().toISOString();
    const row = {
        id: ulid(),
        blockId: null,
        type: v.type,
        date: v.date,
        durationMinutes: v.durationMinutes,
        intensity: v.intensity ?? null,
        notes: v.notes ?? null,
        gymFocus: v.gymFocus ?? null,
        cardioKind: v.cardioKind ?? null,
        distanceKm: v.distanceKm ?? null,
        sportName: v.sportName ?? null,
        createdAt: now,
        updatedAt: now,
    };
    ctx.db.insert(workoutSessions).values(row).run();
    return toSession(row);
}
export function updateSession(ctx, id, input) {
    const patch = parse(SessionUpdateInput, input);
    const cur = getSessionRow(ctx, id);
    const next = {
        ...cur,
        type: patch.type ?? cur.type,
        date: patch.date ?? cur.date,
        durationMinutes: patch.durationMinutes ?? cur.durationMinutes,
        intensity: patch.intensity ?? cur.intensity,
        notes: patch.notes ?? cur.notes,
        gymFocus: patch.gymFocus ?? cur.gymFocus,
        cardioKind: patch.cardioKind ?? cur.cardioKind,
        distanceKm: patch.distanceKm ?? cur.distanceKm,
        sportName: patch.sportName ?? cur.sportName,
        updatedAt: ctx.clock.now().toISOString(),
    };
    ctx.db.update(workoutSessions).set(next).where(eq(workoutSessions.id, id)).run();
    return toSession(next);
}
export function deleteSession(ctx, id) {
    const cur = getSessionRow(ctx, id);
    ctx.db.delete(workoutSessions).where(eq(workoutSessions.id, id)).run();
    return toSession(cur);
}
/** Exactly one session per block; re-reviewing replaces the previous values. */
export function upsertSessionForBlock(ctx, block, minutes, details) {
    if (!block.workoutType)
        throw new AppError('VALIDATION', 'Block is not a workout', { workoutType: 'Not a workout block' });
    const d = parse(WorkoutDetails, details);
    const durationMinutes = Math.max(1, Math.round(minutes));
    const now = ctx.clock.now().toISOString();
    const date = localDateOf(new Date(block.start), getTimezone(ctx));
    const existing = ctx.db.select().from(workoutSessions).where(eq(workoutSessions.blockId, block.id)).get();
    const row = {
        id: existing?.id ?? ulid(),
        blockId: block.id,
        type: block.workoutType,
        date,
        durationMinutes,
        intensity: d.intensity ?? null,
        notes: d.notes ?? null,
        gymFocus: d.gymFocus ?? null,
        cardioKind: d.cardioKind ?? null,
        distanceKm: d.distanceKm ?? null,
        sportName: d.sportName ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    if (existing)
        ctx.db.update(workoutSessions).set(row).where(eq(workoutSessions.id, existing.id)).run();
    else
        ctx.db.insert(workoutSessions).values(row).run();
    return toSession(row);
}
export function deleteSessionForBlock(ctx, blockId) {
    ctx.db.delete(workoutSessions).where(eq(workoutSessions.blockId, blockId)).run();
}
// ---- lifts ----
function getLiftRow(ctx, id) {
    const row = ctx.db.select().from(lifts).where(eq(lifts.id, id)).get();
    if (!row)
        throw notFound('Lift');
    return row;
}
function setsOf(ctx, liftId) {
    return ctx.db
        .select()
        .from(topSets)
        .where(eq(topSets.liftId, liftId))
        .orderBy(desc(topSets.date), desc(topSets.id))
        .all()
        .map(toSet);
}
export function listLiftSummaries(ctx) {
    return ctx.db
        .select()
        .from(lifts)
        .orderBy(asc(lifts.sortOrder), asc(lifts.id))
        .all()
        .map((l) => {
        const sets = setsOf(ctx, l.id);
        return { lift: toLift(l), prs: computePRs(sets), lastSet: sets[0] ?? null };
    });
}
export function createLift(ctx, input) {
    const v = parse(LiftInput, input);
    const top = ctx.db.select({ m: max(lifts.sortOrder) }).from(lifts).get()?.m;
    const row = {
        id: ulid(),
        name: v.name,
        sortOrder: top === null || top === undefined ? 0 : top + 1,
        createdAt: ctx.clock.now().toISOString(),
    };
    ctx.db.insert(lifts).values(row).run();
    return toLift(row);
}
export function renameLift(ctx, id, input) {
    const v = parse(LiftInput, input);
    const cur = getLiftRow(ctx, id);
    ctx.db.update(lifts).set({ name: v.name }).where(eq(lifts.id, id)).run();
    return toLift({ ...cur, name: v.name });
}
export function deleteLift(ctx, id) {
    const cur = getLiftRow(ctx, id);
    if (ctx.db.select({ id: topSets.id }).from(topSets).where(eq(topSets.liftId, id)).limit(1).get()) {
        throw new AppError('CONFLICT', 'Lift has logged top sets and cannot be deleted');
    }
    ctx.db.delete(lifts).where(eq(lifts.id, id)).run();
    return toLift(cur);
}
// ---- top sets ----
export function addTopSet(ctx, liftId, input) {
    const v = parse(TopSetInput, input);
    getLiftRow(ctx, liftId);
    const now = ctx.clock.now();
    const row = {
        id: ulid(),
        liftId,
        date: v.date ?? localDateOf(now, getTimezone(ctx)),
        weightKg: v.weightKg,
        reps: v.reps,
        notes: v.notes ?? null,
        createdAt: now.toISOString(),
    };
    ctx.db.insert(topSets).values(row).run();
    return toSet(row);
}
export function deleteTopSet(ctx, liftId, setId) {
    const row = ctx.db.select().from(topSets).where(and(eq(topSets.id, setId), eq(topSets.liftId, liftId))).get();
    if (!row)
        throw notFound('Top set');
    ctx.db.delete(topSets).where(eq(topSets.id, setId)).run();
    return toSet(row);
}
/** Newest first. */
export function liftHistory(ctx, liftId) {
    getLiftRow(ctx, liftId);
    return setsOf(ctx, liftId);
}

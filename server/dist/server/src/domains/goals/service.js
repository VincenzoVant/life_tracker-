import { ulid } from 'ulid';
import { GoalSet, WORKOUT_TYPES } from '@life-tracker/shared';
import { goals } from '../../db/schema.js';
import { parse } from '../../lib/validate.js';
export function getGoals(ctx) {
    const set = GoalSet.parse({});
    for (const r of ctx.db.select().from(goals).all()) {
        if (!r.active)
            continue;
        switch (r.kind) {
            case 'startup_minutes':
                set.startupMinutes = r.target;
                break;
            case 'workouts_total':
                set.workoutsTotal = r.target;
                break;
            case 'workouts_by_type':
                if (r.workoutType && WORKOUT_TYPES.includes(r.workoutType)) {
                    set.workoutsByType[r.workoutType] = r.target;
                }
                break;
            case 'free_evenings':
                set.freeEvenings = r.target;
                break;
            case 'daily_kcal':
                set.dailyKcal = { target: r.target, tolerancePct: r.tolerancePct ?? 10 };
                break;
            case 'daily_protein_g':
                set.dailyProteinG = r.target;
                break;
        }
    }
    return set;
}
/** Replaces the whole goal set in one transaction; a null goal has no row. */
export function saveGoals(ctx, input) {
    const v = parse(GoalSet, input);
    const rows = [];
    const add = (kind, target, extra = {}) => {
        if (target !== null)
            rows.push({ id: ulid(), kind, target, active: true, ...extra });
    };
    add('startup_minutes', v.startupMinutes);
    add('workouts_total', v.workoutsTotal);
    for (const t of WORKOUT_TYPES)
        add('workouts_by_type', v.workoutsByType[t], { workoutType: t });
    add('free_evenings', v.freeEvenings);
    if (v.dailyKcal)
        add('daily_kcal', v.dailyKcal.target, { tolerancePct: v.dailyKcal.tolerancePct });
    add('daily_protein_g', v.dailyProteinG);
    ctx.db.transaction((tx) => {
        tx.delete(goals).run();
        if (rows.length > 0)
            tx.insert(goals).values(rows).run();
    });
    return getGoals(ctx);
}

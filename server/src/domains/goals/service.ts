import { ulid } from 'ulid';
import { GoalSet, WORKOUT_TYPES, type WorkoutType } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { goals } from '../../db/schema.js';
import { parse } from '../../lib/validate.js';

type Row = typeof goals.$inferInsert;

export function getGoals(ctx: Ctx): GoalSet {
  const set = GoalSet.parse({});
  for (const r of ctx.db.select().from(goals).all()) {
    if (!r.active) continue;
    switch (r.kind) {
      case 'startup_minutes':
        set.startupMinutes = r.target;
        break;
      case 'workouts_total':
        set.workoutsTotal = r.target;
        break;
      case 'workouts_by_type':
        if (r.workoutType && (WORKOUT_TYPES as readonly string[]).includes(r.workoutType)) {
          set.workoutsByType[r.workoutType as WorkoutType] = r.target;
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
export function saveGoals(ctx: Ctx, input: GoalSet): GoalSet {
  const v = parse(GoalSet, input);
  const rows: Row[] = [];
  const add = (kind: string, target: number | null, extra: Partial<Row> = {}) => {
    if (target !== null) rows.push({ id: ulid(), kind, target, active: true, ...extra });
  };
  add('startup_minutes', v.startupMinutes);
  add('workouts_total', v.workoutsTotal);
  for (const t of WORKOUT_TYPES) add('workouts_by_type', v.workoutsByType[t], { workoutType: t });
  add('free_evenings', v.freeEvenings);
  if (v.dailyKcal) add('daily_kcal', v.dailyKcal.target, { tolerancePct: v.dailyKcal.tolerancePct });
  add('daily_protein_g', v.dailyProteinG);
  ctx.db.transaction((tx) => {
    tx.delete(goals).run();
    if (rows.length > 0) tx.insert(goals).values(rows).run();
  });
  return getGoals(ctx);
}

/** Merges the given top-level goals onto the stored set, so pages only send the goals they own. */
export function patchGoals(ctx: Ctx, input: unknown): GoalSet {
  const patch = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return saveGoals(ctx, { ...getGoals(ctx), ...patch } as GoalSet);
}

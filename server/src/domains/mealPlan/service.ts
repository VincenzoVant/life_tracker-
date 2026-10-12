import { and, eq, gte, lte } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  MealPlanEntryInput,
  addDays,
  type Meal,
  type MealPlanEntry,
  type MealSlot,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { mealPlanEntries, meals } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';

type EntryRow = typeof mealPlanEntries.$inferSelect;
type MealRow = typeof meals.$inferSelect;

const toMeal = (r: MealRow): Meal => ({
  id: r.id,
  name: r.name,
  kcal: r.kcal,
  proteinG: r.proteinG,
  carbsG: r.carbsG,
  fatG: r.fatG,
  notes: r.notes,
  archived: r.archived,
});

const toEntry = (r: EntryRow, m: MealRow): MealPlanEntry => ({
  id: r.id,
  date: r.date,
  slot: r.slot as MealSlot,
  mealId: r.mealId,
  servings: r.servings,
  meal: toMeal(m),
});

export function listMealPlan(ctx: Ctx, weekStart: string): MealPlanEntry[] {
  const rows = ctx.db
    .select({ e: mealPlanEntries, m: meals })
    .from(mealPlanEntries)
    .innerJoin(meals, eq(meals.id, mealPlanEntries.mealId))
    .where(and(gte(mealPlanEntries.date, weekStart), lte(mealPlanEntries.date, addDays(weekStart, 6))))
    .all();
  return rows
    .map((r) => toEntry(r.e, r.m))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
}

export function getMealPlanEntry(ctx: Ctx, date: string, slot: string): EntryRow | undefined {
  return ctx.db
    .select()
    .from(mealPlanEntries)
    .where(and(eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot)))
    .get();
}

export function setMealPlanEntry(ctx: Ctx, date: string, slot: MealSlot, input: MealPlanEntryInput): MealPlanEntry {
  const v = parse(MealPlanEntryInput, input);
  const meal = ctx.db.select().from(meals).where(eq(meals.id, v.mealId)).get();
  if (!meal) throw new AppError('VALIDATION', 'Invalid input', { mealId: 'Meal not found' });
  if (meal.archived) throw new AppError('VALIDATION', 'Invalid input', { mealId: 'Meal is archived' });
  const existing = getMealPlanEntry(ctx, date, slot);
  const row: EntryRow = { id: existing?.id ?? ulid(), date, slot, mealId: meal.id, servings: v.servings };
  ctx.db
    .insert(mealPlanEntries)
    .values(row)
    .onConflictDoUpdate({
      target: [mealPlanEntries.date, mealPlanEntries.slot],
      set: { mealId: row.mealId, servings: row.servings },
    })
    .run();
  return toEntry(row, meal);
}

export function clearMealPlanEntry(ctx: Ctx, date: string, slot: MealSlot): void {
  const res = ctx.db
    .delete(mealPlanEntries)
    .where(and(eq(mealPlanEntries.date, date), eq(mealPlanEntries.slot, slot)))
    .run();
  if (res.changes === 0) throw notFound('Meal plan entry');
}

export function repeatLastWeek(ctx: Ctx, weekStart: string): { copied: number } {
  const prev = listMealPlan(ctx, addDays(weekStart, -7));
  let copied = 0;
  ctx.sqlite.transaction((): void => {
    for (const e of prev) {
      if (e.meal.archived) continue;
      const date = addDays(e.date, 7);
      if (getMealPlanEntry(ctx, date, e.slot)) continue;
      ctx.db
        .insert(mealPlanEntries)
        .values({ id: ulid(), date, slot: e.slot, mealId: e.mealId, servings: e.servings })
        .run();
      copied++;
    }
  })();
  return { copied };
}

import { asc, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { FreeTextMealLogInput, MealInput, MealUpdateInput, SavedMealLogInput, } from '@life-tracker/shared';
import { mealLogs, meals } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
const toMeal = (r) => ({
    id: r.id,
    name: r.name,
    kcal: r.kcal,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    notes: r.notes,
    archived: r.archived,
});
const toLog = (r) => ({
    id: r.id,
    date: r.date,
    slot: r.slot,
    mealId: r.mealId,
    freeText: r.freeText,
    servings: r.servings,
    kcal: r.kcal,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
});
const round1 = (n) => Math.round(n * 10) / 10;
function getMealRow(ctx, id) {
    const row = ctx.db.select().from(meals).where(eq(meals.id, id)).get();
    if (!row)
        throw notFound('Meal');
    return row;
}
export function listMeals(ctx, opts = {}) {
    const q = ctx.db.select().from(meals);
    const rows = (opts.includeArchived ? q : q.where(eq(meals.archived, false)))
        .orderBy(asc(meals.name), asc(meals.id))
        .all();
    return rows.map(toMeal);
}
export function createMeal(ctx, input) {
    const v = parse(MealInput, input);
    const row = {
        id: ulid(),
        name: v.name,
        kcal: v.kcal,
        proteinG: v.proteinG,
        carbsG: v.carbsG ?? null,
        fatG: v.fatG ?? null,
        notes: v.notes ?? null,
        archived: false,
        createdAt: ctx.clock.now().toISOString(),
    };
    ctx.db.insert(meals).values(row).run();
    return toMeal(row);
}
export function updateMeal(ctx, id, input) {
    const v = parse(MealUpdateInput, input);
    getMealRow(ctx, id);
    const patch = {};
    if (v.name !== undefined)
        patch.name = v.name;
    if (v.kcal !== undefined)
        patch.kcal = v.kcal;
    if (v.proteinG !== undefined)
        patch.proteinG = v.proteinG;
    if (v.carbsG !== undefined)
        patch.carbsG = v.carbsG;
    if (v.fatG !== undefined)
        patch.fatG = v.fatG;
    if (v.notes !== undefined)
        patch.notes = v.notes;
    if (Object.keys(patch).length > 0)
        ctx.db.update(meals).set(patch).where(eq(meals.id, id)).run();
    return toMeal(getMealRow(ctx, id));
}
export function archiveMeal(ctx, id) {
    getMealRow(ctx, id);
    ctx.db.update(meals).set({ archived: true }).where(eq(meals.id, id)).run();
    return toMeal(getMealRow(ctx, id));
}
export function logMeal(ctx, input) {
    const now = ctx.clock.now().toISOString();
    let row;
    // Pick the schema by shape so validation errors name the right fields.
    if (typeof input === 'object' && input !== null && 'mealId' in input) {
        const v = parse(SavedMealLogInput, input);
        const meal = ctx.db.select().from(meals).where(eq(meals.id, v.mealId)).get();
        if (!meal)
            throw new AppError('VALIDATION', 'Invalid input', { mealId: 'Meal not found' });
        if (meal.archived)
            throw new AppError('VALIDATION', 'Invalid input', { mealId: 'Meal is archived' });
        row = {
            id: ulid(),
            date: v.date,
            slot: v.slot,
            mealId: meal.id,
            freeText: null,
            servings: v.servings,
            kcal: round1(meal.kcal * v.servings),
            proteinG: round1(meal.proteinG * v.servings),
            carbsG: meal.carbsG === null ? null : round1(meal.carbsG * v.servings),
            fatG: meal.fatG === null ? null : round1(meal.fatG * v.servings),
            createdAt: now,
        };
    }
    else {
        const v = parse(FreeTextMealLogInput, input);
        row = {
            id: ulid(),
            date: v.date,
            slot: v.slot,
            mealId: null,
            freeText: v.freeText,
            servings: 1,
            kcal: v.kcal,
            proteinG: v.proteinG,
            carbsG: v.carbsG ?? null,
            fatG: v.fatG ?? null,
            createdAt: now,
        };
    }
    ctx.db.insert(mealLogs).values(row).run();
    return toLog(row);
}
export function deleteMealLog(ctx, id) {
    const row = ctx.db.select().from(mealLogs).where(eq(mealLogs.id, id)).get();
    if (!row)
        throw notFound('Meal log');
    ctx.db.delete(mealLogs).where(eq(mealLogs.id, id)).run();
    return { ok: true };
}
export function listMealLogs(ctx, date) {
    return ctx.db
        .select()
        .from(mealLogs)
        .where(eq(mealLogs.date, date))
        .orderBy(asc(mealLogs.createdAt), asc(mealLogs.id))
        .all()
        .map(toLog);
}
export function dailyTotals(ctx, dates) {
    const out = {};
    for (const d of dates)
        out[d] = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    if (dates.length === 0)
        return out;
    const rows = ctx.db.select().from(mealLogs).where(inArray(mealLogs.date, dates)).all();
    for (const r of rows) {
        const t = out[r.date];
        t.kcal += r.kcal;
        t.proteinG += r.proteinG;
        t.carbsG += r.carbsG ?? 0;
        t.fatG += r.fatG ?? 0;
    }
    for (const t of Object.values(out)) {
        t.kcal = round1(t.kcal);
        t.proteinG = round1(t.proteinG);
        t.carbsG = round1(t.carbsG);
        t.fatG = round1(t.fatG);
    }
    return out;
}

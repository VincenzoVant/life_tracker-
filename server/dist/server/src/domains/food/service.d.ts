import { MealInput, MealUpdateInput, type DailyTotals, type Meal, type MealLog, type MealLogInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function listMeals(ctx: Ctx, opts?: {
    includeArchived?: boolean;
}): Meal[];
export declare function createMeal(ctx: Ctx, input: MealInput): Meal;
export declare function updateMeal(ctx: Ctx, id: string, input: MealUpdateInput): Meal;
export declare function archiveMeal(ctx: Ctx, id: string): Meal;
export declare function logMeal(ctx: Ctx, input: MealLogInput): MealLog;
export declare function deleteMealLog(ctx: Ctx, id: string): {
    ok: true;
};
export declare function listMealLogs(ctx: Ctx, date: string): MealLog[];
export declare function dailyTotals(ctx: Ctx, dates: string[]): Record<string, DailyTotals>;

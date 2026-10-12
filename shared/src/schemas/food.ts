import { z } from 'zod';
import { MEAL_SLOTS, type MealSlot } from './blocks.js';
import { LocalDate } from './localDate.js';

const localDate = LocalDate;

export interface Meal {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
  archived: boolean;
}

export const MealInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000).optional(),
  fatG: z.number().min(0).max(1000).optional(),
  notes: z.string().max(2000).optional(),
});
export type MealInput = z.infer<typeof MealInput>;

export const MealUpdateInput = MealInput.partial();
export type MealUpdateInput = z.infer<typeof MealUpdateInput>;

export const MealListQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type MealListQuery = z.infer<typeof MealListQuery>;

export interface MealLog {
  id: string;
  date: string;
  slot: MealSlot;
  mealId: string | null;
  freeText: string | null;
  servings: number;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
}

export const SavedMealLogInput = z.object({
  date: localDate,
  slot: z.enum(MEAL_SLOTS),
  mealId: z.string().min(1),
  servings: z.number().gt(0).max(20),
});
export const FreeTextMealLogInput = z.object({
  date: localDate,
  slot: z.enum(MEAL_SLOTS),
  freeText: z.string().trim().min(1, 'Describe what you ate').max(200),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000).optional(),
  fatG: z.number().min(0).max(1000).optional(),
});
export const MealLogInput = z.union([SavedMealLogInput, FreeTextMealLogInput]);
export type MealLogInput = z.infer<typeof MealLogInput>;

export const MealLogListQuery = z.object({ date: localDate });

export interface DailyTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

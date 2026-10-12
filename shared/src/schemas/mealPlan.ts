import { z } from 'zod';
import { MEAL_SLOTS, type MealSlot } from './blocks.js';
import type { Meal } from './food.js';
import { isoWeekday } from '../time.js';
import { LocalDate } from './localDate.js';

const localDate = LocalDate;
const monday = localDate.refine((d) => isoWeekday(d) === 1, 'Must be a Monday');

export interface MealPlanEntry {
  id: string;
  date: string;
  slot: MealSlot;
  mealId: string;
  servings: number;
  meal: Meal;
}

export const MealPlanEntryInput = z.object({
  mealId: z.string().min(1),
  servings: z.number().gt(0).max(20),
});
export type MealPlanEntryInput = z.infer<typeof MealPlanEntryInput>;

export const MealPlanSlotParams = z.object({ date: localDate, slot: z.enum(MEAL_SLOTS) });
export const MealPlanQuery = z.object({ weekStart: monday });
export const MealPlanRepeatInput = z.object({ weekStart: monday });

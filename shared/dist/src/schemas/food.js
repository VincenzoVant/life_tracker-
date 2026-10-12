import { z } from 'zod';
import { MEAL_SLOTS } from './blocks.js';
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
export const MealInput = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    kcal: z.number().min(0).max(5000),
    proteinG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(1000).optional(),
    fatG: z.number().min(0).max(1000).optional(),
    notes: z.string().max(2000).optional(),
});
export const MealUpdateInput = MealInput.partial();
export const MealListQuery = z.object({
    includeArchived: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
});
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
export const MealLogListQuery = z.object({ date: localDate });

import { z } from 'zod';
import { type MealSlot } from './blocks.js';
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
export declare const MealInput: z.ZodObject<{
    name: z.ZodString;
    kcal: z.ZodNumber;
    proteinG: z.ZodNumber;
    carbsG: z.ZodOptional<z.ZodNumber>;
    fatG: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type MealInput = z.infer<typeof MealInput>;
export declare const MealUpdateInput: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    kcal: z.ZodOptional<z.ZodNumber>;
    proteinG: z.ZodOptional<z.ZodNumber>;
    carbsG: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    fatG: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type MealUpdateInput = z.infer<typeof MealUpdateInput>;
export declare const MealListQuery: z.ZodObject<{
    includeArchived: z.ZodOptional<z.ZodPipe<z.ZodEnum<{
        false: "false";
        true: "true";
    }>, z.ZodTransform<boolean, "false" | "true">>>;
}, z.core.$strip>;
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
export declare const SavedMealLogInput: z.ZodObject<{
    date: z.ZodString;
    slot: z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>;
    mealId: z.ZodString;
    servings: z.ZodNumber;
}, z.core.$strip>;
export declare const FreeTextMealLogInput: z.ZodObject<{
    date: z.ZodString;
    slot: z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>;
    freeText: z.ZodString;
    kcal: z.ZodNumber;
    proteinG: z.ZodNumber;
    carbsG: z.ZodOptional<z.ZodNumber>;
    fatG: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const MealLogInput: z.ZodUnion<readonly [z.ZodObject<{
    date: z.ZodString;
    slot: z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>;
    mealId: z.ZodString;
    servings: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    date: z.ZodString;
    slot: z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>;
    freeText: z.ZodString;
    kcal: z.ZodNumber;
    proteinG: z.ZodNumber;
    carbsG: z.ZodOptional<z.ZodNumber>;
    fatG: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>]>;
export type MealLogInput = z.infer<typeof MealLogInput>;
export declare const MealLogListQuery: z.ZodObject<{
    date: z.ZodString;
}, z.core.$strip>;
export interface DailyTotals {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
}

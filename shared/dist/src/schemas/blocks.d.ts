import { z } from 'zod';
import { type Category } from '../categories.js';
export declare const BLOCK_STATUSES: readonly ['proposed', 'committed', 'done', 'partial', 'skipped', 'removed'];
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export declare const BLOCK_SOURCES: readonly ['planner', 'fixed', 'manual', 'quick_add', 'unplanned'];
export type BlockSource = (typeof BLOCK_SOURCES)[number];
export declare const WORKOUT_TYPES: readonly ['gym', 'cardio', 'sport'];
export type WorkoutType = (typeof WORKOUT_TYPES)[number];
export declare const MEAL_SLOTS: readonly ['breakfast', 'lunch', 'dinner', 'snack'];
export type MealSlot = (typeof MEAL_SLOTS)[number];
export interface Block {
    id: string;
    category: Category;
    title: string;
    start: string;
    end: string;
    status: BlockStatus;
    actualMinutes: number | null;
    source: BlockSource;
    locked: boolean;
    courseId: string | null;
    startupTaskId: string | null;
    workoutType: WorkoutType | null;
    mealSlot: MealSlot | null;
    fixedEventId: string | null;
    planId: string | null;
    gcalEventId: string | null;
    gcalEtag: string | null;
    gcalSyncedAt: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare const BlockCreateInput: z.ZodObject<{
    category: z.ZodEnum<{
        appointment: "appointment";
        errand: "errand";
        meal: "meal";
        meal_prep: "meal_prep";
        other: "other";
        rest: "rest";
        social: "social";
        startup: "startup";
        study: "study";
        work: "work";
        workout: "workout";
    }>;
    title: z.ZodString;
    start: z.ZodISODateTime;
    end: z.ZodISODateTime;
    courseId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    startupTaskId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    workoutType: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        cardio: "cardio";
        gym: "gym";
        sport: "sport";
    }>>>;
    mealSlot: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type BlockCreateInput = z.infer<typeof BlockCreateInput>;
/** Partial patch; cross-field rules that need the full block are re-checked by the server on the merged result. */
export declare const BlockUpdateInput: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<{
        appointment: "appointment";
        errand: "errand";
        meal: "meal";
        meal_prep: "meal_prep";
        other: "other";
        rest: "rest";
        social: "social";
        startup: "startup";
        study: "study";
        work: "work";
        workout: "workout";
    }>>;
    title: z.ZodOptional<z.ZodString>;
    start: z.ZodOptional<z.ZodISODateTime>;
    end: z.ZodOptional<z.ZodISODateTime>;
    courseId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    startupTaskId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    workoutType: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        cardio: "cardio";
        gym: "gym";
        sport: "sport";
    }>>>>;
    mealSlot: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        breakfast: "breakfast";
        dinner: "dinner";
        lunch: "lunch";
        snack: "snack";
    }>>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
}, z.core.$strip>;
export type BlockUpdateInput = z.infer<typeof BlockUpdateInput>;
export declare const BlockListQuery: z.ZodObject<{
    from: z.ZodISODateTime;
    to: z.ZodISODateTime;
    includeRemoved: z.ZodOptional<z.ZodLiteral<"true">>;
}, z.core.$strip>;
export type BlockListQuery = z.infer<typeof BlockListQuery>;
export declare function blockMinutes(b: Pick<Block, 'start' | 'end'>): number;

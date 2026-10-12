import { z } from 'zod';
import type { WorkoutType } from './blocks.js';
export declare const GoalSet: z.ZodObject<{
    startupMinutes: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    workoutsTotal: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    workoutsByType: z.ZodDefault<z.ZodObject<{
        gym: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        cardio: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        sport: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strip>>;
    freeEvenings: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    dailyKcal: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        target: z.ZodNumber;
        tolerancePct: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    dailyProteinG: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
export type GoalSet = z.infer<typeof GoalSet>;
export declare const WeekProgressQuery: z.ZodObject<{
    weekStart: z.ZodString;
}, z.core.$strip>;
export type WeekProgressQuery = z.infer<typeof WeekProgressQuery>;
export interface Metric {
    goal: number | null;
    planned: number;
    actual: number;
}
export interface NutritionDay {
    date: string;
    kcal: number;
    proteinG: number;
    kcalTarget: number | null;
    proteinTarget: number | null;
    kcalOk: boolean | null;
    proteinOk: boolean | null;
}
export interface WeekProgress {
    weekStart: string;
    study: Array<{
        courseId: string;
        name: string;
        color: string;
    } & Metric>;
    startup: Metric;
    work: {
        planned: number;
        actual: number;
    };
    workouts: {
        total: Metric;
        byType: Record<WorkoutType, Metric>;
    };
    freeEvenings: Metric & {
        freeDates: string[];
    };
    nutrition: NutritionDay[];
}

import { z } from 'zod';
import { addDays, isoWeekday } from '../time.js';
import type { WorkoutType } from './blocks.js';

const goalMinutes = z.number().int().min(0).max(100_000).nullable().default(null);
const goalCount = z.number().int().min(0).max(100).nullable().default(null);

export const GoalSet = z.object({
  startupMinutes: goalMinutes,
  workoutsTotal: goalCount,
  workoutsByType: z
    .object({ gym: goalCount, cardio: goalCount, sport: goalCount })
    .default({ gym: null, cardio: null, sport: null }),
  freeEvenings: z.number().int().min(0, 'Must be 0 to 7').max(7, 'Must be 0 to 7').nullable().default(null),
  dailyKcal: z
    .object({
      target: z.number().gt(0).max(20_000),
      tolerancePct: z.number().min(0).max(100).default(10),
    })
    .nullable()
    .default(null),
  dailyProteinG: z.number().gt(0).max(1000).nullable().default(null),
});
export type GoalSet = z.infer<typeof GoalSet>;

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .refine((d) => {
    try {
      return addDays(d, 0) === d;
    } catch {
      return false;
    }
  }, 'Not a valid date');

export const WeekProgressQuery = z.object({
  weekStart: localDate.refine((d) => isoWeekday(d) === 1, 'Must be a Monday'),
  includeProposed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
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
  study: Array<{ courseId: string; name: string; color: string } & Metric>;
  startup: Metric;
  work: { planned: number; actual: number };
  workouts: { total: Metric; byType: Record<WorkoutType, Metric> };
  freeEvenings: Metric & { freeDates: string[] };
  nutrition: NutritionDay[];
}

export const TREND_WEEKS = [4, 12, 26] as const;
export const TrendsQuery = z.object({
  weeks: z.coerce.number().refine((n) => (TREND_WEEKS as readonly number[]).includes(n), 'Must be 4, 12 or 26'),
});

export interface WeekTrend {
  weekStart: string;
  studyMinutes: { goal: number | null; actual: number };
  startupMinutes: { goal: number | null; actual: number };
  workMinutes: { actual: number };
  workouts: { goal: number | null; actual: number };
  freeEvenings: { goal: number | null; actual: number };
  avgKcal: number | null;
  avgProteinG: number | null;
  daysKcalOk: number;
  daysProteinOk: number;
}

export interface Streaks {
  reviewDays: number;
  workoutWeeks: number;
}

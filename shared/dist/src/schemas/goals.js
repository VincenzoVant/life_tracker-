import { z } from 'zod';
import { addDays, isoWeekday } from '../time.js';
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
const localDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine((d) => {
    try {
        return addDays(d, 0) === d;
    }
    catch {
        return false;
    }
}, 'Not a valid date');
export const WeekProgressQuery = z.object({
    weekStart: localDate.refine((d) => isoWeekday(d) === 1, 'Must be a Monday'),
});

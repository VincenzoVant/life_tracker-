import { z } from 'zod';
import { WORKOUT_TYPES } from './blocks.js';
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
export const WorkoutDetails = z.object({
    intensity: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2000, 'Notes are too long').optional(),
    gymFocus: z.string().trim().min(1).max(100).optional(),
    cardioKind: z.string().trim().min(1).max(100).optional(),
    distanceKm: z.number().gt(0).max(500).optional(),
    sportName: z.string().trim().min(1).max(100).optional(),
});
export const SessionInput = z
    .object({
    type: z.enum(WORKOUT_TYPES),
    date: localDate,
    durationMinutes: z.number().int().min(1).max(600),
})
    .extend(WorkoutDetails.shape);
export const SessionUpdateInput = SessionInput.partial();
export const SessionListQuery = z.object({ from: localDate, to: localDate });
export const LiftInput = z.object({ name: z.string().trim().min(1, 'Name is required').max(80) });
/** Date defaults to today (local) when omitted. */
export const TopSetInput = z.object({
    date: localDate.optional(),
    weightKg: z.number().gt(0).max(1000),
    reps: z.number().int().min(1).max(100),
    notes: z.string().max(500).optional(),
});

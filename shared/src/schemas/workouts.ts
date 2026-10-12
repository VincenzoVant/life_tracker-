import { z } from 'zod';
import { WORKOUT_TYPES, type WorkoutType } from './blocks.js';

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const WorkoutDetails = z.object({
  intensity: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000, 'Notes are too long').optional(),
  gymFocus: z.string().trim().min(1).max(100).optional(),
  cardioKind: z.string().trim().min(1).max(100).optional(),
  distanceKm: z.number().gt(0).max(500).optional(),
  sportName: z.string().trim().min(1).max(100).optional(),
});
export type WorkoutDetails = z.infer<typeof WorkoutDetails>;

export interface WorkoutSession {
  id: string;
  blockId: string | null;
  type: WorkoutType;
  date: string;
  durationMinutes: number;
  intensity: number | null;
  notes: string | null;
  gymFocus: string | null;
  cardioKind: string | null;
  distanceKm: number | null;
  sportName: string | null;
  /** Computed, never stored: round(durationMinutes*60/distanceKm) for cardio with a distance. */
  paceSecPerKm: number | null;
}

export const SessionInput = z
  .object({
    type: z.enum(WORKOUT_TYPES),
    date: localDate,
    durationMinutes: z.number().int().min(1).max(600),
  })
  .extend(WorkoutDetails.shape);
export type SessionInput = z.infer<typeof SessionInput>;

export const SessionUpdateInput = SessionInput.partial();
export type SessionUpdateInput = z.infer<typeof SessionUpdateInput>;

export const SessionListQuery = z.object({ from: localDate, to: localDate });
export type SessionListQuery = z.infer<typeof SessionListQuery>;

export interface Lift {
  id: string;
  name: string;
  sortOrder: number;
}

export const LiftInput = z.object({ name: z.string().trim().min(1, 'Name is required').max(80) });
export type LiftInput = z.infer<typeof LiftInput>;

export interface TopSet {
  id: string;
  liftId: string;
  date: string;
  weightKg: number;
  reps: number;
  notes: string | null;
}

/** Date defaults to today (local) when omitted. */
export const TopSetInput = z.object({
  date: localDate.optional(),
  weightKg: z.number().gt(0).max(1000),
  reps: z.number().int().min(1).max(100),
  notes: z.string().max(500).optional(),
});
export type TopSetInput = z.infer<typeof TopSetInput>;

export interface PRs {
  heaviest: TopSet | null;
  bestE1rm: { value: number; set: TopSet } | null;
}

export interface LiftSummary {
  lift: Lift;
  prs: PRs;
  lastSet: TopSet | null;
}

/** Epley one-rep-max estimate, rounded to one decimal. Shared so server PRs and web charts agree. */
export function epley1rm(weightKg: number, reps: number): number {
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

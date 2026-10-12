import { z } from 'zod';
import { BlockCreateInput, type Block } from './blocks.js';
import { WorkoutDetails } from './workouts.js';
import type { WeekProgress } from './goals.js';
import { LocalDate } from './localDate.js';

const localDate = LocalDate;

export const REVIEW_OUTCOMES = ['done', 'partial', 'skipped'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const ReviewEntry = z.object({
  blockId: z.string().min(1),
  outcome: z.enum(REVIEW_OUTCOMES),
  actualMinutes: z.number().int('Must be a whole number of minutes').optional(),
  workout: WorkoutDetails.optional(),
  completeStartupTask: z.boolean().optional(),
  ateAsPlanned: z.boolean().optional(),
});
export type ReviewEntry = z.infer<typeof ReviewEntry>;

export const UnplannedEntry = BlockCreateInput.and(
  z.object({
    actualMinutes: z.number().int('Must be a whole number of minutes').optional(),
    workout: WorkoutDetails.optional(),
  }),
);
export type UnplannedEntry = z.infer<typeof UnplannedEntry>;

export const ReviewSubmission = z.object({
  date: localDate,
  entries: z.array(ReviewEntry).max(2000),
  unplanned: z.array(UnplannedEntry).max(50).default([]),
});
export type ReviewSubmission = z.input<typeof ReviewSubmission>;

export const ReviewQuery = z.object({ date: localDate });
export type ReviewQuery = z.infer<typeof ReviewQuery>;

export interface PendingBlock extends Block {
  plannedMeal?: { mealId: string; name: string; servings: number };
}

export interface PendingReview {
  date: string;
  pending: PendingBlock[];
  reviewed: Block[];
  completedAt: string | null;
}

export interface ReviewResult {
  date: string;
  progress: WeekProgress;
}

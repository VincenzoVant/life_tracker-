import { z } from 'zod';
import { CATEGORIES, type Category } from '../categories.js';
import { minutesBetween } from '../time.js';

export const BLOCK_STATUSES = ['proposed', 'committed', 'done', 'partial', 'skipped', 'removed'] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];
export const BLOCK_SOURCES = ['planner', 'fixed', 'manual', 'quick_add', 'unplanned'] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];
export const WORKOUT_TYPES = ['gym', 'cardio', 'sport'] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
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
  occurrenceDate?: string | null;
  removedBy?: 'user' | 'schedule' | null;
  planId: string | null;
  gcalEventId: string | null;
  gcalEtag: string | null;
  gcalSyncedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const iso = z.iso.datetime({ message: 'Must be an ISO datetime' });

const blockFields = {
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
  start: iso,
  end: iso,
  courseId: z.string().min(1).nullish(),
  startupTaskId: z.string().min(1).nullish(),
  workoutType: z.enum(WORKOUT_TYPES).nullish(),
  mealSlot: z.enum(MEAL_SLOTS).nullish(),
  notes: z.string().max(2000, 'Notes are too long').nullish(),
};

type Refinable = {
  category?: Category;
  start?: string;
  end?: string;
  courseId?: string | null;
  startupTaskId?: string | null;
  workoutType?: string | null;
  mealSlot?: string | null;
};

function refineBlock(v: Refinable, ctx: z.RefinementCtx, partial: boolean): void {
  const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.start !== undefined && v.end !== undefined) {
    const mins = minutesBetween(v.start, v.end);
    if (mins <= 0) add('end', 'End must be after start');
    else if (mins > 24 * 60) add('end', 'A block can be at most 24 hours');
  }
  if (partial && v.category === undefined) return;
  if (v.category === 'workout' && !v.workoutType && !partial) add('workoutType', 'Workout type is required for workouts');
  if (v.category === 'meal' && !v.mealSlot && !partial) add('mealSlot', 'Meal slot is required for meals');
  if (v.category !== undefined) {
    if (v.courseId && v.category !== 'study') add('courseId', 'Course is only allowed on study blocks');
    if (v.startupTaskId && v.category !== 'startup') add('startupTaskId', 'Startup task is only allowed on startup blocks');
    if (v.workoutType && v.category !== 'workout') add('workoutType', 'Workout type is only allowed on workouts');
    if (v.mealSlot && v.category !== 'meal') add('mealSlot', 'Meal slot is only allowed on meals');
  }
}

export const BlockCreateInput = z
  .object(blockFields)
  .superRefine((v, ctx) => refineBlock(v, ctx, false));
export type BlockCreateInput = z.infer<typeof BlockCreateInput>;

/** Partial patch; cross-field rules that need the full block are re-checked by the server on the merged result. */
export const BlockUpdateInput = z
  .object(blockFields)
  .partial()
  .superRefine((v, ctx) => refineBlock(v, ctx, true));
export type BlockUpdateInput = z.infer<typeof BlockUpdateInput>;

export const BlockListQuery = z.object({
  from: iso,
  to: iso,
  includeRemoved: z.literal('true').optional(),
});
export type BlockListQuery = z.infer<typeof BlockListQuery>;

export function blockMinutes(b: Pick<Block, 'start' | 'end'>): number {
  return minutesBetween(b.start, b.end);
}

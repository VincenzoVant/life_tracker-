import { z } from 'zod';
import { CATEGORIES } from '../categories.js';
import { minutesBetween } from '../time.js';
export const BLOCK_STATUSES = ['proposed', 'committed', 'done', 'partial', 'skipped', 'removed'];
export const BLOCK_SOURCES = ['planner', 'fixed', 'manual', 'quick_add', 'unplanned'];
export const WORKOUT_TYPES = ['gym', 'cardio', 'sport'];
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
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
function refineBlock(v, ctx, partial) {
    const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.start !== undefined && v.end !== undefined) {
        const mins = minutesBetween(v.start, v.end);
        if (mins <= 0)
            add('end', 'End must be after start');
        else if (mins > 24 * 60)
            add('end', 'A block can be at most 24 hours');
    }
    if (partial && v.category === undefined)
        return;
    if (v.category === 'workout' && !v.workoutType && !partial)
        add('workoutType', 'Workout type is required for workouts');
    if (v.category === 'meal' && !v.mealSlot && !partial)
        add('mealSlot', 'Meal slot is required for meals');
    if (v.category !== undefined) {
        if (v.courseId && v.category !== 'study')
            add('courseId', 'Course is only allowed on study blocks');
        if (v.startupTaskId && v.category !== 'startup')
            add('startupTaskId', 'Startup task is only allowed on startup blocks');
        if (v.workoutType && v.category !== 'workout')
            add('workoutType', 'Workout type is only allowed on workouts');
        if (v.mealSlot && v.category !== 'meal')
            add('mealSlot', 'Meal slot is only allowed on meals');
    }
}
export const BlockCreateInput = z
    .object(blockFields)
    .superRefine((v, ctx) => refineBlock(v, ctx, false));
/** Partial patch; cross-field rules that need the full block are re-checked by the server on the merged result. */
export const BlockUpdateInput = z
    .object(blockFields)
    .partial()
    .superRefine((v, ctx) => refineBlock(v, ctx, true));
export const BlockListQuery = z.object({
    from: iso,
    to: iso,
    includeRemoved: z.literal('true').optional(),
});
export function blockMinutes(b) {
    return minutesBetween(b.start, b.end);
}

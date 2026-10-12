import { z } from 'zod';
import { LocalDate } from './localDate.js';
import { isoWeekday } from '../time.js';
import type { Category } from '../categories.js';
import type { Block, MealSlot, WorkoutType } from './blocks.js';

export interface BusyInterval {
  start: string;
  end: string;
  title: string;
  calendarId?: string;
  externalEventId?: string;
}

export interface ApiShortfall {
  kind: 'study' | 'startup' | 'workout' | 'free_evenings';
  courseId?: string;
  courseName?: string;
  workoutType?: WorkoutType;
  missing: number;
  unit: 'minutes' | 'count';
}

export interface ApiPlanChange {
  type: 'moved' | 'shortened' | 'removed' | 'added';
  blockId: string | null;
  title: string;
  category: Category;
  from: { start: string; end: string } | null;
  to: { start: string; end: string } | null;
  /** Links an `added` block carries, so Apply can create it. */
  courseId?: string;
  startupTaskId?: string;
  workoutType?: WorkoutType;
  mealSlot?: MealSlot;
}

export interface PlanSummary {
  shortfalls: ApiShortfall[];
  reservedEvenings: string[];
  changes?: ApiPlanChange[];
  conflictId?: string;
}

export type PlanMode = 'full' | 'replan';
export type PlanStatus = 'draft' | 'applied' | 'discarded';

export interface Plan {
  id: string;
  weekStart: string;
  mode: PlanMode;
  triggerBlockId: string | null;
  status: PlanStatus;
  createdAt: string;
  summary: PlanSummary;
}

export interface PlanDraft {
  plan: Plan;
  blocks: Block[];
}

export const PlanCreateInput = z.object({
  weekStart: LocalDate.refine((d) => isoWeekday(d) === 1, 'Must be a Monday'),
});
export type PlanCreateInput = z.infer<typeof PlanCreateInput>;

export const PlanDraftQuery = PlanCreateInput;
export type PlanDraftQuery = z.infer<typeof PlanDraftQuery>;

import { z } from 'zod';
import { addDays, isoWeekday } from '../time.js';
import type { Block, WorkoutType } from './blocks.js';

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

/** Filled by Stage 4 (replan); absent on full plans. */
export interface PlanChange {
  blockId: string;
  kind: 'moved' | 'removed' | 'added';
  from?: string;
  to?: string;
  reason?: string;
}

export interface PlanSummary {
  shortfalls: ApiShortfall[];
  reservedEvenings: string[];
  changes?: PlanChange[];
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
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .refine((d) => {
      try {
        return addDays(d, 0) === d;
      } catch {
        return false;
      }
    }, 'Not a valid date')
    .refine((d) => isoWeekday(d) === 1, 'Must be a Monday'),
});
export type PlanCreateInput = z.infer<typeof PlanCreateInput>;

export const PlanDraftQuery = PlanCreateInput;
export type PlanDraftQuery = z.infer<typeof PlanDraftQuery>;

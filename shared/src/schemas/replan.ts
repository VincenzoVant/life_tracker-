import { z } from 'zod';
import type { Block } from './blocks.js';
import type { ApiPlanChange, ApiShortfall, Plan } from './plans.js';

export const QUICK_ADD_CATEGORIES = ['social', 'errand', 'appointment', 'other'] as const;
export const QUICK_ADD_PRESETS = ['rest_of_tonight', 'this_afternoon', 'all_day'] as const;

export const QuickAddWhenSchema = z.union([
  z.object({ preset: z.enum(QUICK_ADD_PRESETS) }),
  z.object({
    start: z.iso.datetime({ message: 'Must be an ISO datetime' }),
    durationMinutes: z.number().int().min(15, 'At least 15 minutes').max(1440, 'At most 24 hours'),
  }),
]);
export type QuickAddWhen = z.infer<typeof QuickAddWhenSchema>;

export const QuickAddInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
  category: z.enum(QUICK_ADD_CATEGORIES).default('social'),
  when: QuickAddWhenSchema,
  notes: z.string().max(2000, 'Notes are too long').optional(),
});
export type QuickAddInput = z.infer<typeof QuickAddInput>;

export interface ReplanDraft {
  plan: Plan;
  changes: ApiPlanChange[];
  shortfalls: ApiShortfall[];
}

export interface QuickAddResult {
  block: Block;
  draft: ReplanDraft | null;
}

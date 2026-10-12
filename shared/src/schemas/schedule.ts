import { z } from 'zod';

export interface FixedEvent {
  id: string;
  title: string;
  kind: 'class' | 'work';
  courseId: string | null;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  active: boolean;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const fixedEventFields = {
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
  kind: z.enum(['class', 'work']),
  courseId: z.string().min(1).nullish(),
  weekday: z.number().int().min(1).max(7),
  startTime: time,
  endTime: time,
  validFrom: date,
  validTo: date,
  active: z.boolean(),
};

interface Refinable {
  kind?: 'class' | 'work';
  courseId?: string | null;
  startTime?: string;
  endTime?: string;
  validFrom?: string;
  validTo?: string;
}

/** Cross-field rules; run on the full (merged) event. */
function refineFixedEvent(v: Refinable, ctx: z.RefinementCtx): void {
  const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.startTime !== undefined && v.endTime !== undefined && v.endTime <= v.startTime) {
    add('endTime', 'End must be after start');
  }
  if (v.validFrom !== undefined && v.validTo !== undefined && v.validTo < v.validFrom) {
    add('validTo', 'Valid-to must not be before valid-from');
  }
  if (v.kind === 'class' && !v.courseId) add('courseId', 'Course is required for classes');
  if (v.kind === 'work' && v.courseId) add('courseId', 'Course is not allowed for work');
}

export const FixedEventInput = z.object({ ...fixedEventFields, active: z.boolean().default(true) }).superRefine(refineFixedEvent);
export type FixedEventInput = z.infer<typeof FixedEventInput>;

/** Partial patch; the server re-validates the merged result with FixedEventInput. */
export const FixedEventUpdateInput = z.object(fixedEventFields).partial();
export type FixedEventUpdateInput = z.infer<typeof FixedEventUpdateInput>;

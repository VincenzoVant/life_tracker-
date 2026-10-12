import { z } from 'zod';

/** A real calendar date as YYYY-MM-DD (rejects shapes like 2026-13-45 and 2026-02-30). */
export const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .refine((d) => {
    const t = new Date(`${d}T12:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, 'Not a valid date');
export type LocalDate = z.infer<typeof LocalDate>;

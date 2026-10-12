import type { z } from 'zod';
import { AppError } from './errors.js';

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!(key in fields)) fields[key] = issue.message;
  }
  throw new AppError('VALIDATION', 'Invalid input', fields);
}

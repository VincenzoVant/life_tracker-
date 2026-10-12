import type { z } from 'zod';
export declare function parse<T>(schema: z.ZodType<T>, data: unknown): T;

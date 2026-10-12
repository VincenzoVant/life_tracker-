import { z } from 'zod';
export const CourseInput = z.object({
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Must be a #rrggbb color'),
    weeklyGoalMinutes: z.number().int().min(0).max(6000),
});
export const CourseUpdateInput = CourseInput.partial().extend({ active: z.boolean().optional() });
export const CourseListQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

import { z } from 'zod';

export interface Course {
  id: string;
  name: string;
  color: string;
  weeklyGoalMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const CourseInput = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Must be a #rrggbb color'),
  weeklyGoalMinutes: z.number().int().min(0).max(6000),
});
export type CourseInput = z.infer<typeof CourseInput>;

export const CourseUpdateInput = CourseInput.partial().extend({ active: z.boolean().optional() });
export type CourseUpdateInput = z.infer<typeof CourseUpdateInput>;

export const CourseListQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
export type CourseListQuery = z.infer<typeof CourseListQuery>;

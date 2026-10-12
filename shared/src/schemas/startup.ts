import { z } from 'zod';
import { LocalDate } from './localDate.js';

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TaskStatusSchema = z.enum(TASK_STATUSES);

export interface StartupTask {
  id: string;
  title: string;
  status: TaskStatus;
  milestoneId: string | null;
  sortOrder: number;
  doneAt: string | null;
}

export interface Milestone {
  id: string;
  title: string;
  targetDate: string | null;
  doneAt: string | null;
  sortOrder: number;
}

export const TaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  milestoneId: z.string().min(1).nullable().optional(),
  status: TaskStatusSchema.optional(),
});
export type TaskInput = z.infer<typeof TaskInput>;

export const TaskUpdateInput = TaskInput.partial();
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;

export const TaskListQuery = z.object({ status: TaskStatusSchema.optional() });
export type TaskListQuery = z.infer<typeof TaskListQuery>;

export const TaskReorderInput = z.object({ ids: z.array(z.string().min(1)) });
export type TaskReorderInput = z.infer<typeof TaskReorderInput>;

export const MilestoneInput = z.object({
  title: z.string().trim().min(1).max(200),
  targetDate: LocalDate.nullable()
    .optional(),
  done: z.boolean().optional(),
});
export type MilestoneInput = z.infer<typeof MilestoneInput>;

export const MilestoneUpdateInput = MilestoneInput.partial();
export type MilestoneUpdateInput = z.infer<typeof MilestoneUpdateInput>;

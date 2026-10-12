import { z } from 'zod';
export const TASK_STATUSES = ['todo', 'doing', 'done'];
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export const TaskInput = z.object({
    title: z.string().trim().min(1).max(200),
    milestoneId: z.string().min(1).nullable().optional(),
    status: TaskStatusSchema.optional(),
});
export const TaskUpdateInput = TaskInput.partial();
export const TaskListQuery = z.object({ status: TaskStatusSchema.optional() });
export const TaskReorderInput = z.object({ ids: z.array(z.string().min(1)) });
export const MilestoneInput = z.object({
    title: z.string().trim().min(1).max(200),
    targetDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .nullable()
        .optional(),
    done: z.boolean().optional(),
});
export const MilestoneUpdateInput = MilestoneInput.partial();

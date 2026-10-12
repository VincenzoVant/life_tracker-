import { z } from 'zod';
export declare const TASK_STATUSES: readonly ['todo', 'doing', 'done'];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export declare const TaskStatusSchema: z.ZodEnum<{
    doing: "doing";
    done: "done";
    todo: "todo";
}>;
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
export declare const TaskInput: z.ZodObject<{
    title: z.ZodString;
    milestoneId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<{
        doing: "doing";
        done: "done";
        todo: "todo";
    }>>;
}, z.core.$strip>;
export type TaskInput = z.infer<typeof TaskInput>;
export declare const TaskUpdateInput: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    milestoneId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<{
        doing: "doing";
        done: "done";
        todo: "todo";
    }>>>;
}, z.core.$strip>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;
export declare const TaskListQuery: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        doing: "doing";
        done: "done";
        todo: "todo";
    }>>;
}, z.core.$strip>;
export type TaskListQuery = z.infer<typeof TaskListQuery>;
export declare const TaskReorderInput: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type TaskReorderInput = z.infer<typeof TaskReorderInput>;
export declare const MilestoneInput: z.ZodObject<{
    title: z.ZodString;
    targetDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    done: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type MilestoneInput = z.infer<typeof MilestoneInput>;
export declare const MilestoneUpdateInput: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    targetDate: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    done: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type MilestoneUpdateInput = z.infer<typeof MilestoneUpdateInput>;

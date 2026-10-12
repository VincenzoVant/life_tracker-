import { MilestoneInput, MilestoneUpdateInput, TaskInput, TaskUpdateInput, type Milestone, type StartupTask, type TaskStatus } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function listTasks(ctx: Ctx, opts?: {
    status?: TaskStatus;
}): StartupTask[];
/** Tasks that are not done, in manual order (the Stage 2 planner reads this). */
export declare function listOpenTasks(ctx: Ctx): StartupTask[];
export declare function createTask(ctx: Ctx, input: TaskInput): StartupTask;
export declare function updateTask(ctx: Ctx, id: string, input: TaskUpdateInput): StartupTask;
/** Linked blocks keep their history; the FK sets their startupTaskId to null. */
export declare function deleteTask(ctx: Ctx, id: string): StartupTask;
export declare function reorderTasks(ctx: Ctx, ids: string[]): StartupTask[];
export declare function listMilestones(ctx: Ctx): Milestone[];
export declare function createMilestone(ctx: Ctx, input: MilestoneInput): Milestone;
export declare function updateMilestone(ctx: Ctx, id: string, input: MilestoneUpdateInput): Milestone;
/** Tasks in the milestone keep existing with milestoneId set to null by the FK. */
export declare function deleteMilestone(ctx: Ctx, id: string): Milestone;

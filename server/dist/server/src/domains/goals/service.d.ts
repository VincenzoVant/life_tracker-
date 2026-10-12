import { GoalSet } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function getGoals(ctx: Ctx): GoalSet;
/** Replaces the whole goal set in one transaction; a null goal has no row. */
export declare function saveGoals(ctx: Ctx, input: GoalSet): GoalSet;

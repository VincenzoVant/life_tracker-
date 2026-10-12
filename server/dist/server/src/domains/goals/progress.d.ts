import { type WeekProgress } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export interface WeekProgressOpts {
    classesCountTowardStudy?: boolean;
    eveningStart?: string;
    sleepStart?: string;
}
export declare function getWeekProgress(ctx: Ctx, weekStart: string, opts?: WeekProgressOpts): WeekProgress;

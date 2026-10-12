import { LiftInput, SessionInput, SessionUpdateInput, TopSetInput, WorkoutDetails, type Block, type Lift, type LiftSummary, type TopSet, type WorkoutSession } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function listSessions(ctx: Ctx, query: {
    from: string;
    to: string;
}): WorkoutSession[];
export declare function createSession(ctx: Ctx, input: SessionInput): WorkoutSession;
export declare function updateSession(ctx: Ctx, id: string, input: SessionUpdateInput): WorkoutSession;
export declare function deleteSession(ctx: Ctx, id: string): WorkoutSession;
/** Exactly one session per block; re-reviewing replaces the previous values. */
export declare function upsertSessionForBlock(ctx: Ctx, block: Block, minutes: number, details: WorkoutDetails): WorkoutSession;
export declare function deleteSessionForBlock(ctx: Ctx, blockId: string): void;
export declare function listLiftSummaries(ctx: Ctx): LiftSummary[];
export declare function createLift(ctx: Ctx, input: LiftInput): Lift;
export declare function renameLift(ctx: Ctx, id: string, input: LiftInput): Lift;
export declare function deleteLift(ctx: Ctx, id: string): Lift;
export declare function addTopSet(ctx: Ctx, liftId: string, input: TopSetInput): TopSet;
export declare function deleteTopSet(ctx: Ctx, liftId: string, setId: string): TopSet;
/** Newest first. */
export declare function liftHistory(ctx: Ctx, liftId: string): TopSet[];

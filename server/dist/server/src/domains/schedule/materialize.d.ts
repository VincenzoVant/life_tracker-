import type { Ctx } from '../../ctx.js';
export declare const HORIZON_DAYS = 56;
export interface MaterializeResult {
    created: number;
    updated: number;
    removed: number;
}
/**
 * Rolling window: creates missing occurrences for today..today+56. Only when `fixedEventId` is given (the event was
 * just created/edited) are existing future committed occurrences moved or removed; the daily run never touches them.
 */
export declare function materializeFixedEvents(ctx: Ctx, opts?: {
    fixedEventId?: string;
}): MaterializeResult;

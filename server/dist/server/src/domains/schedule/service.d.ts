import { type FixedEvent, type FixedEventUpdateInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
export declare function listFixedEvents(ctx: Ctx): FixedEvent[];
export declare function createFixedEvent(ctx: Ctx, input: unknown): FixedEvent;
export declare function updateFixedEvent(ctx: Ctx, id: string, patch: FixedEventUpdateInput): FixedEvent;
/** Future committed occurrences become `removed`; past blocks keep their (now dangling) fixedEventId. */
export declare function deleteFixedEvent(ctx: Ctx, id: string): void;

import { BlockCreateInput, type Block, type BlockSource, type BlockStatus, type BlockUpdateInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
/** Checks that referenced courses / startup tasks exist (archived courses are still valid links). */
export declare function assertLinksExist(ctx: Ctx, links: {
    courseId?: string | null;
    startupTaskId?: string | null;
}): void;
export declare function listBlocks(ctx: Ctx, q: {
    from: Date;
    to: Date;
    includeRemoved?: boolean;
}): Block[];
export declare function getBlock(ctx: Ctx, id: string): Block;
export interface CreateBlockOpts {
    source?: BlockSource;
    status?: BlockStatus;
    locked?: boolean;
    planId?: string | null;
    fixedEventId?: string | null;
    actualMinutes?: number | null;
}
export declare function createBlock(ctx: Ctx, input: BlockCreateInput, opts?: CreateBlockOpts): Block;
export declare function updateBlock(ctx: Ctx, id: string, patch: BlockUpdateInput): Block;
export declare function setBlockStatus(ctx: Ctx, id: string, to: BlockStatus, actualMinutes?: number | null): Block;
/** For schedule materialization only: moves/renames a `source = 'fixed'` block, bypassing the fixed-time guard. */
export declare function updateFixedBlockInternal(ctx: Ctx, id: string, patch: {
    start?: string;
    end?: string;
    title?: string;
    courseId?: string | null;
}): Block;
/** Hard delete; proposed blocks never reach Google, so nothing is emitted. */
export declare function deleteProposedBlocks(ctx: Ctx, ids: string[]): void;

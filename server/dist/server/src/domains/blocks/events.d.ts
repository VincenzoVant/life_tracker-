export type BlockChange = {
    blockId: string;
    kind: 'created' | 'updated' | 'removed';
};
export interface BlockEventBus {
    emit(change: BlockChange): void;
    subscribe(fn: (c: BlockChange) => void): () => void;
}
/** Listeners run synchronously, so they share the caller's transaction. */
export declare function createBlockEventBus(): BlockEventBus;

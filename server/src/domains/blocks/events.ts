export type BlockChange = { blockId: string; kind: 'created' | 'updated' | 'removed' };

export interface BlockEventBus {
  emit(change: BlockChange): void;
  subscribe(fn: (c: BlockChange) => void): () => void;
}

/** Listeners run synchronously, so they share the caller's transaction. */
export function createBlockEventBus(): BlockEventBus {
  const listeners = new Set<(c: BlockChange) => void>();
  return {
    emit(change) {
      for (const fn of [...listeners]) fn(change);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

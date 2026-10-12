/** Listeners run synchronously, so they share the caller's transaction. */
export function createBlockEventBus() {
    const listeners = new Set();
    return {
        emit(change) {
            for (const fn of [...listeners])
                fn(change);
        },
        subscribe(fn) {
            listeners.add(fn);
            return () => {
                listeners.delete(fn);
            };
        },
    };
}

export const systemClock = { now: () => new Date() };
export function fixedClock(iso) {
    let current = new Date(iso);
    return {
        now: () => new Date(current),
        set(next) {
            current = new Date(next);
        },
    };
}

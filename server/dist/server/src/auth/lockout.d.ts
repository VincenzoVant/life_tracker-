import type { Clock } from '../lib/clock.js';
/** In-memory, global lockout: 5 failures within 15 minutes lock login for 15 minutes. */
export declare function createLockout(clock: Clock): {
    check(): void;
    recordFailure(): void;
    reset(): void;
};

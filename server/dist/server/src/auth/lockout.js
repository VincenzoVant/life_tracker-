import { AppError } from '../lib/errors.js';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
/** In-memory, global lockout: 5 failures within 15 minutes lock login for 15 minutes. */
export function createLockout(clock) {
    let failures = [];
    let lockedUntil = 0;
    return {
        check() {
            if (lockedUntil > clock.now().getTime()) {
                throw new AppError('LOCKED_OUT', 'Too many failed attempts. Try again in a few minutes.');
            }
        },
        recordFailure() {
            const now = clock.now().getTime();
            failures = failures.filter((t) => now - t < WINDOW_MS);
            failures.push(now);
            if (failures.length >= MAX_FAILURES) {
                lockedUntil = now + WINDOW_MS;
                failures = [];
            }
        },
        reset() {
            failures = [];
            lockedUntil = 0;
        },
    };
}

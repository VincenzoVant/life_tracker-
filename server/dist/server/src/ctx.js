import { createBlockEventBus } from './domains/blocks/events.js';
import { systemClock } from './lib/clock.js';
export function createCtx(handle, config, clock = systemClock) {
    const events = createBlockEventBus();
    return { db: handle.db, sqlite: handle.sqlite, clock, config, events };
}

import type { Block, FixedEvent, Preferences } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import type { Pads } from '../../planner/types.js';
import { listFixedEvents } from '../schedule/service.js';

/** Buffers an existing block keeps around itself: classes use their own or the class default, workouts the workout buffer. */
export function blockPads(b: Block, prefs: Preferences, fixed: Map<string, FixedEvent>): Pads {
  if (b.source === 'fixed') {
    const ev = b.fixedEventId ? fixed.get(b.fixedEventId) : undefined;
    const isClass = ev ? ev.kind === 'class' : b.category === 'study';
    const def = isClass ? prefs.classBuffer : { before: prefs.bufferMinutes, after: prefs.bufferMinutes };
    return { padBefore: ev?.bufferBefore ?? def.before, padAfter: ev?.bufferAfter ?? def.after };
  }
  if (b.category === 'workout') return { padBefore: prefs.workoutBuffer.before, padAfter: prefs.workoutBuffer.after };
  return {};
}

/** Returns a `pads(block)` lookup bound to the current fixed events. */
export function padsLookup(ctx: Ctx, prefs: Preferences): (b: Block) => Pads {
  const fixed = new Map(listFixedEvents(ctx).map((e) => [e.id, e]));
  return (b) => blockPads(b, prefs, fixed);
}

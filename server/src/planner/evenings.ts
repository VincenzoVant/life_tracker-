import { eveningWindowUtc, isoWeekday, localDateOf } from '@life-tracker/shared';
import { rangeDates } from './days.js';
import { mergeIntervals, overlaps, subtractIntervals } from './intervals.js';
import type { Timeline } from './timeline.js';
import type { Interval, PlannerInput, Shortfall } from './types.js';

const BLOCKING = new Set(['study', 'startup', 'work']);

export function reserveEvenings(
  _t: Timeline,
  input: PlannerInput,
): { reserved: string[]; reservedIntervals: Interval[]; shortfall: Shortfall | null } {
  const found = input.goals.find((g) => g.kind === 'free_evenings');
  const goal = found && found.kind === 'free_evenings' ? found : null;

  const { prefs, timezone: tz, range } = input;
  const occupiedMinutes = new Map<string, number>();
  for (const e of input.existing) {
    const d = localDateOf(new Date(e.start), tz);
    occupiedMinutes.set(d, (occupiedMinutes.get(d) ?? 0) + (e.end - e.start) / 60_000);
  }

  const eligible = rangeDates(range, tz)
    .map((date) => {
      const w = eveningWindowUtc(date, prefs, tz);
      return { date, window: { start: w.start.getTime(), end: w.end.getTime() } };
    })
    .filter(({ window }) => window.start >= range.start && window.end > window.start)
    .filter(
      ({ window }) =>
        !input.existing.some((e) => BLOCKING.has(e.category) && overlaps(e, window)) &&
        // A night out still counts as free: only busy time covering the whole window rules it out.
        subtractIntervals([window], mergeIntervals(input.busy)).length > 0,
    );

  const isProtected = (date: string) => prefs.protectedEvenings.includes(isoWeekday(date));
  const protectedDates = eligible.filter((e) => isProtected(e.date));
  const others = eligible
    .filter((e) => !isProtected(e.date))
    .sort((a, b) => (occupiedMinutes.get(a.date) ?? 0) - (occupiedMinutes.get(b.date) ?? 0) || a.date.localeCompare(b.date));

  const chosen = [...protectedDates];
  for (const o of others) {
    if (!goal || chosen.length >= goal.count) break;
    chosen.push(o);
  }
  chosen.sort((a, b) => a.date.localeCompare(b.date));

  const missing = goal ? goal.count - chosen.length : 0;
  return {
    reserved: chosen.map((c) => c.date),
    reservedIntervals: chosen.map((c) => c.window),
    shortfall: goal && missing > 0 ? { goal, missing } : null,
  };
}

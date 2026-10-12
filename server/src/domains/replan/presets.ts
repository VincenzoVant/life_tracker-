import {
  dayBoundsUtc, localDateOf, sleepStartUtc, zonedToUtc,
  type Preferences, type QuickAddWhen,
} from '@life-tracker/shared';
import { AppError } from '../../lib/errors.js';
import { ceilTo15, MINUTE_MS } from '../../planner/intervals.js';

/** Resolves a quick-add time choice to a concrete interval; presets start at the next quarter hour. */
export function resolveQuickAddWhen(
  when: QuickAddWhen,
  now: Date,
  prefs: Preferences,
  tz: string,
): { start: Date; end: Date } {
  if ('start' in when) {
    const start = new Date(when.start);
    return { start, end: new Date(start.getTime() + when.durationMinutes * MINUTE_MS) };
  }

  const today = localDateOf(now, tz);
  const from = ceilTo15(now.getTime());
  const bedtime = sleepStartUtc(today, prefs, tz).getTime();

  let start = from;
  let end = bedtime;
  let message = "It's already past your bedtime";
  if (when.preset === 'this_afternoon') {
    start = Math.max(from, zonedToUtc(today, '12:00', tz).getTime());
    end = zonedToUtc(today, '18:00', tz).getTime();
    message = 'The afternoon is over';
  } else if (when.preset === 'all_day') {
    start = Math.max(from, dayBoundsUtc(today, prefs, tz).start.getTime());
  }

  if (end - start < 15 * MINUTE_MS) throw new AppError('VALIDATION', message, { when: message });
  return { start: new Date(start), end: new Date(end) };
}

import {
  addDays, dayBoundsUtc, localDateOf, sleepStartUtc, zonedToUtc,
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

  const calendarDay = localDateOf(now, tz);
  const from = ceilTo15(now.getTime());
  // Between midnight and bedtime (or, for "tonight", wake time) the night still belongs to the previous date.
  const beforeLateBedtime = now.getTime() < sleepStartUtc(addDays(calendarDay, -1), prefs, tz).getTime();
  const beforeWake = now.getTime() < dayBoundsUtc(calendarDay, prefs, tz).start.getTime();
  const prev = addDays(calendarDay, -1);

  let start = from;
  let end: number;
  let message = "It's already past your bedtime";
  if (when.preset === 'this_afternoon') {
    start = Math.max(from, zonedToUtc(calendarDay, '12:00', tz).getTime());
    end = zonedToUtc(calendarDay, '18:00', tz).getTime();
    message = 'The afternoon is over';
  } else if (when.preset === 'all_day') {
    const day = beforeLateBedtime ? prev : calendarDay;
    start = Math.max(from, dayBoundsUtc(day, prefs, tz).start.getTime());
    end = sleepStartUtc(day, prefs, tz).getTime();
  } else {
    end = sleepStartUtc(beforeLateBedtime || beforeWake ? prev : calendarDay, prefs, tz).getTime();
  }

  if (end - start < 15 * MINUTE_MS) throw new AppError('VALIDATION', message, { when: message });
  return { start: new Date(start), end: new Date(end) };
}

import { addDays, dayBoundsUtc, localDateOf, zonedToUtc, type Preferences } from '@life-tracker/shared';
import type { Interval, Ms } from './types.js';

export interface DayWindow {
  date: string;
  start: Ms;
  end: Ms;
}

/** Local dates (YYYY-MM-DD) touched by the half-open range. */
export function rangeDates(range: Interval, tz: string): string[] {
  if (range.end <= range.start) return [];
  const first = localDateOf(new Date(range.start), tz);
  const last = localDateOf(new Date(range.end - 1), tz);
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Usable window per local date: day bounds (sleep, earliest/latest) clipped to the range; empty ones dropped. */
export function buildDayWindows(range: Interval, tz: string, prefs: Preferences): DayWindow[] {
  const out: DayWindow[] = [];
  for (const date of rangeDates(range, tz)) {
    const b = dayBoundsUtc(date, prefs, tz);
    const start = Math.max(b.start.getTime(), range.start);
    const end = Math.min(b.end.getTime(), range.end);
    if (end > start) out.push({ date, start, end });
  }
  return out;
}

export function localWindow(date: string, w: { start: string; end: string }, tz: string): Interval {
  return { start: zonedToUtc(date, w.start, tz).getTime(), end: zonedToUtc(date, w.end, tz).getTime() };
}

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const DAY_MS = 86_400_000;

/** Date-only arithmetic: parse YYYY-MM-DD at UTC noon so it never depends on a timezone. */
function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function addDays(date: string, n: number): string {
  return new Date(parseDate(date).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function isoWeekday(date: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const d = parseDate(date).getUTCDay();
  return (d === 0 ? 7 : d) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

export function localTimeOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'HH:mm');
}

export function zonedToUtc(date: string, time: string, tz: string): Date {
  return fromZonedTime(`${date}T${time}:00`, tz);
}

export function dayRangeUtc(date: string, tz: string): { start: Date; end: Date } {
  return { start: zonedToUtc(date, '00:00', tz), end: zonedToUtc(addDays(date, 1), '00:00', tz) };
}

export function weekStartOf(instant: Date, tz: string): string {
  const date = localDateOf(instant, tz);
  return addDays(date, 1 - isoWeekday(date));
}

export function weekRangeUtc(weekStart: string, tz: string): { start: Date; end: Date } {
  return { start: zonedToUtc(weekStart, '00:00', tz), end: zonedToUtc(addDays(weekStart, 7), '00:00', tz) };
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

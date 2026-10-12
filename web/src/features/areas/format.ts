import { weekRangeUtc, weekStartOf } from '@life-tracker/shared';

export const hours = (minutes: number): string => (minutes / 60).toFixed(1);

export function currentWeek(tz: string) {
  const weekStart = weekStartOf(new Date(), tz);
  const { start, end } = weekRangeUtc(weekStart, tz);
  return { weekStart, from: start.toISOString(), to: end.toISOString() };
}

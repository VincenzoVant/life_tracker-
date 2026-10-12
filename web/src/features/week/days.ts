import { localDateOf, type Block } from '@life-tracker/shared';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon 12" style label for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** Non-removed blocks that start on the given local date, in time order. */
export function blocksOnDate(blocks: Block[], date: string, tz: string): Block[] {
  return blocks
    .filter((b) => b.status !== 'removed' && localDateOf(new Date(b.start), tz) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

import { dayBoundsUtc, type Preferences } from '@life-tracker/shared';

type DayPrefs = Pick<Preferences, 'sleep' | 'earliestBlock' | 'latestBlockEnd' | 'eveningStart'>;

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes after local midnight the planner may use (earliest/latest block and sleep), as plain wall-clock time. */
export function daySpan(prefs: DayPrefs): { start: number; end: number } {
  const midnight = Date.UTC(2026, 0, 14);
  const b = dayBoundsUtc('2026-01-14', prefs, 'UTC');
  return { start: (b.start.getTime() - midnight) / 60_000, end: (b.end.getTime() - midnight) / 60_000 };
}

/** Minutes per week inside the windows, clipped to the usable day; overlapping windows count once. Empty = whole day. */
export function availableStudyMinutes(prefs: DayPrefs & Pick<Preferences, 'studyWindows'>): number {
  const span = daySpan(prefs);
  let total = 0;
  for (let day = 1; day <= 7; day++) {
    const spans =
      prefs.studyWindows.length === 0
        ? [[span.start, span.end] as const]
        : prefs.studyWindows
            .filter((w) => w.days.includes(day))
            .map((w) => [Math.max(toMin(w.start), span.start), Math.min(toMin(w.end), span.end)] as const)
            .sort((a, b) => a[0] - b[0]);
    let reached = -Infinity;
    for (const [s, e] of spans) {
      if (e <= Math.max(s, reached)) continue;
      total += e - Math.max(s, reached);
      reached = e;
    }
  }
  return total;
}

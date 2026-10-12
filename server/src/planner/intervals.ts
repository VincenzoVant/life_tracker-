import type { Interval, Ms } from './types.js';

export const MINUTE_MS = 60_000;
export const STEP_MS = 15 * MINUTE_MS;

export function ceilTo15(ms: Ms): Ms {
  return Math.ceil(ms / STEP_MS) * STEP_MS;
}

/** Half-open overlap: touching intervals do not overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Sorted union; overlapping and touching intervals are merged. Empty intervals are dropped. */
export function mergeIntervals(xs: Interval[]): Interval[] {
  const sorted = xs
    .filter((x) => x.end > x.start)
    .map((x) => ({ start: x.start, end: x.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push(x);
  }
  return out;
}

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut);
  const out: Interval[] = [];
  for (const b of mergeIntervals(base)) {
    let cursor = b.start;
    for (const c of cuts) {
      if (c.end <= cursor) continue;
      if (c.start >= b.end) break;
      if (c.start > cursor) out.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end });
  }
  return out;
}

export function padIntervals(xs: Interval[], minutes: number): Interval[] {
  const pad = minutes * MINUTE_MS;
  return xs.map((x) => ({ start: x.start - pad, end: x.end + pad }));
}

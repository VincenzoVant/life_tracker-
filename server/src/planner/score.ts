import { localTimeOf } from '@life-tracker/shared';
import type { Interval } from './types.js';
import { MINUTE_MS } from './intervals.js';

export interface ScoreContext {
  preferred: Interval[];
  dayLoadSameCategory: number;
  free: Interval[];
  minGap: number;
  tz: string;
  extraPenalty?: number;
}

export function scoreCandidate(c: Interval, ctx: ScoreContext): number {
  let score = 0;
  if (ctx.preferred.some((p) => c.start >= p.start && c.end <= p.end)) score += 10;
  score -= ctx.dayLoadSameCategory / 30;
  if (localTimeOf(new Date(c.start), ctx.tz) >= '21:00') score -= 5;
  const container = ctx.free.find((f) => c.start >= f.start && c.end <= f.end);
  if (container) {
    const left = (c.start - container.start) / MINUTE_MS;
    const right = (container.end - c.end) / MINUTE_MS;
    if (left > 0 && left < ctx.minGap) score -= 3;
    if (right > 0 && right < ctx.minGap) score -= 3;
  }
  return score - (ctx.extraPenalty ?? 0);
}

/** Highest score; ties go to the earliest start. */
export function pickBest(cands: Interval[], score: (c: Interval) => number): Interval | null {
  let best: Interval | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    const s = score(c);
    if (s > bestScore || (s === bestScore && best !== null && c.start < best.start)) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

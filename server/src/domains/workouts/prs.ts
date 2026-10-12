import type { PRs, TopSet } from '@life-tracker/shared';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function epley1rm(weightKg: number, reps: number): number {
  return round1(weightKg * (1 + reps / 30));
}

/** Heaviest: higher weight, then more reps, then earlier date. Best e1RM: highest estimate, ties to the earlier date. */
export function computePRs(sets: TopSet[]): PRs {
  let heaviest: TopSet | null = null;
  let best: { value: number; set: TopSet } | null = null;
  for (const s of sets) {
    if (
      !heaviest ||
      s.weightKg > heaviest.weightKg ||
      (s.weightKg === heaviest.weightKg &&
        (s.reps > heaviest.reps || (s.reps === heaviest.reps && s.date < heaviest.date)))
    ) {
      heaviest = s;
    }
    const value = epley1rm(s.weightKg, s.reps);
    if (!best || value > best.value || (value === best.value && s.date < best.set.date)) best = { value, set: s };
  }
  return { heaviest, bestE1rm: best };
}

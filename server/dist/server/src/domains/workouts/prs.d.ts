import type { PRs, TopSet } from '@life-tracker/shared';
export declare function epley1rm(weightKg: number, reps: number): number;
/** Heaviest: higher weight, then more reps, then earlier date. Best e1RM: highest estimate, ties to the earlier date. */
export declare function computePRs(sets: TopSet[]): PRs;

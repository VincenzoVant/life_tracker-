import { DEFAULT_PREFERENCES, weekRangeUtc, zonedToUtc, type Preferences } from '@life-tracker/shared';
import type { PlannerBlockRef, PlannerInput } from '../../src/planner/types.js';

export const TZ = 'America/Los_Angeles';
export const NEXT_WEEK = (() => {
  const r = weekRangeUtc('2026-10-19', TZ);
  return { start: r.start.getTime(), end: r.end.getTime() };
})();

export function at(date: string, time: string): number {
  return zonedToUtc(date, time, TZ).getTime();
}

export function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...structuredClone(DEFAULT_PREFERENCES), ...overrides } as Preferences;
}

export function baseInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    range: NEXT_WEEK,
    timezone: TZ,
    prefs: prefs(),
    existing: [],
    busy: [],
    goals: [],
    startupTasks: [],
    ...overrides,
  };
}

export function ref(date: string, from: string, to: string, extra: Partial<PlannerBlockRef> = {}): PlannerBlockRef {
  return { start: at(date, from), end: at(date, to), category: 'other', source: 'manual', ...extra };
}

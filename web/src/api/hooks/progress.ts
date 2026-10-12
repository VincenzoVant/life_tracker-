import { useQuery } from '@tanstack/react-query';
import type { WorkoutType } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { qk } from '../queryKeys';

// TODO(stage1): import from @life-tracker/shared once server task lands
export interface Metric {
  goal: number | null;
  planned: number;
  actual: number;
}

// TODO(stage1): import from @life-tracker/shared once server task lands
export interface WeekProgress {
  weekStart: string;
  study: Array<{ courseId: string; name: string; color: string } & Metric>;
  startup: Metric;
  work: { planned: number; actual: number };
  workouts: { total: Metric; byType: Record<WorkoutType, Metric> };
  freeEvenings: Metric & { freeDates: string[] };
  nutrition: Array<{
    date: string;
    kcal: number;
    proteinG: number;
    kcalTarget: number | null;
    proteinTarget: number | null;
    kcalOk: boolean | null;
    proteinOk: boolean | null;
  }>;
}

export function useWeekProgress(weekStart: string, opts: { includeProposed?: boolean } = {}) {
  const includeProposed = !!opts.includeProposed;
  const params = new URLSearchParams({ weekStart });
  if (includeProposed) params.set('includeProposed', 'true');
  return useQuery({
    queryKey: qk.progress(weekStart, includeProposed),
    queryFn: () => apiFetch<WeekProgress>(`/api/progress/week?${params}`),
  });
}

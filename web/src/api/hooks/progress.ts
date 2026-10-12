import { useQuery } from '@tanstack/react-query';
import type { Metric, Streaks, WeekProgress, WeekTrend } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { qk } from '../queryKeys';

export type { Metric, WeekProgress };

export function useWeekProgress(weekStart: string, opts: { includeProposed?: boolean } = {}) {
  const includeProposed = !!opts.includeProposed;
  const params = new URLSearchParams({ weekStart });
  if (includeProposed) params.set('includeProposed', 'true');
  return useQuery({
    queryKey: qk.progress(weekStart, includeProposed),
    queryFn: () => apiFetch<WeekProgress>(`/api/progress/week?${params}`),
  });
}

export function useTrends(weeks: 4 | 12 | 26) {
  return useQuery({
    queryKey: ['progress', 'trends', weeks] as const,
    queryFn: () => apiFetch<WeekTrend[]>(`/api/progress/trends?weeks=${weeks}`),
  });
}

export function useStreaks() {
  return useQuery({
    queryKey: ['progress', 'streaks'] as const,
    queryFn: () => apiFetch<Streaks>('/api/streaks'),
  });
}

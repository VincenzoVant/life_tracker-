import { useQuery } from '@tanstack/react-query';
import type { Metric, WeekProgress } from '@life-tracker/shared';
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

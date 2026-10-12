import { useQuery } from '@tanstack/react-query';
import type { Block, BlockCreateInput, WorkoutDetails } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk } from '../queryKeys';
import type { WeekProgress } from './progress';

// TODO(stage1): import from @life-tracker/shared once server task lands
export interface ReviewEntry {
  blockId: string;
  outcome: 'done' | 'partial' | 'skipped';
  actualMinutes?: number;
  workout?: WorkoutDetails;
  completeStartupTask?: boolean;
}
export type UnplannedEntry = BlockCreateInput & { actualMinutes?: number; workout?: WorkoutDetails };
export interface ReviewSubmission {
  date: string;
  entries: ReviewEntry[];
  unplanned: UnplannedEntry[];
}
export interface PendingReview {
  date: string;
  pending: Block[];
  reviewed: Block[];
  completedAt: string | null;
}

export const usePendingReview = (date: string) =>
  useQuery({
    queryKey: qk.review(date),
    queryFn: () => apiFetch<PendingReview>(`/api/review?${new URLSearchParams({ date })}`),
  });

export const useSubmitReview = () =>
  useInvalidatingMutation(
    (s: ReviewSubmission) =>
      apiFetch<{ date: string; progress: WeekProgress }>('/api/review', { method: 'POST', body: s }),
    ['blocks', 'progress', 'review', 'workouts', 'startup'],
  );

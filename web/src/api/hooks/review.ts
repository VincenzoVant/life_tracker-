import { useQuery } from '@tanstack/react-query';
import type { PendingReview, ReviewEntry, ReviewResult, ReviewSubmission, UnplannedEntry } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk } from '../queryKeys';

export type { PendingReview, ReviewEntry, ReviewSubmission, UnplannedEntry };

export const usePendingReview = (date: string) =>
  useQuery({
    queryKey: qk.review(date),
    queryFn: () => apiFetch<PendingReview>(`/api/review?${new URLSearchParams({ date })}`),
  });

export const useSubmitReview = () =>
  useInvalidatingMutation(
    (s: ReviewSubmission) =>
      apiFetch<ReviewResult>('/api/review', { method: 'POST', body: s }),
    ['blocks', 'progress', 'review', 'workouts', 'startup'],
  );

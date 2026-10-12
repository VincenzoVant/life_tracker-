import { useQuery } from '@tanstack/react-query';
import type { Block, Plan, QuickAddInput, QuickAddResult, ReplanDraft } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import type { QueryFamily } from '../queryKeys';

const FAMILIES: QueryFamily[] = ['blocks', 'progress', 'plans', 'google'];

export function useReplanDraft(planId: string) {
  return useQuery({
    queryKey: ['plans', 'replan', planId],
    queryFn: () => apiFetch<ReplanDraft>(`/api/replan/${planId}`),
  });
}

export const useQuickAdd = () =>
  useInvalidatingMutation(
    (input: Omit<QuickAddInput, 'category'> & { category?: QuickAddInput['category'] }) =>
      apiFetch<QuickAddResult>('/api/quick-add', { method: 'POST', body: input }),
    FAMILIES,
  );

export const useApplyReplan = () =>
  useInvalidatingMutation(
    (planId: string) => apiFetch<{ plan: Plan; blocks: Block[] }>(`/api/replan/${planId}/apply`, { method: 'POST' }),
    FAMILIES,
  );

export const useKeepAsIs = () =>
  useInvalidatingMutation((planId: string) => apiFetch<Plan>(`/api/replan/${planId}/keep`, { method: 'POST' }), FAMILIES);

/** A fresh draft for the same trigger after a stale apply; `{ draft: null }` when nothing needs to move. */
export const useRetryReplan = () =>
  useInvalidatingMutation(
    (planId: string) => apiFetch<ReplanDraft | { draft: null }>(`/api/replan/${planId}/retry`, { method: 'POST' }),
    FAMILIES,
  );

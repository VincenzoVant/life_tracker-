import { useQuery } from '@tanstack/react-query';
import type { Block, BlockCreateInput, PlanDraft } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const FAMILIES: QueryFamily[] = ['blocks', 'progress', 'plans'];

/** The week's draft plan, or null when none exists. `weekStart` must be a Monday. */
export function useDraft(weekStart: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.planDraft(weekStart),
    queryFn: () => apiFetch<PlanDraft | null>(`/api/plans/draft?${new URLSearchParams({ weekStart })}`),
    enabled: opts.enabled ?? true,
  });
}

export const useCreatePlan = () =>
  useInvalidatingMutation(
    (weekStart: string) => apiFetch<PlanDraft>('/api/plans', { method: 'POST', body: { weekStart } }),
    FAMILIES,
  );

export const useAddDraftBlock = () =>
  useInvalidatingMutation(
    ({ planId, ...input }: { planId: string } & BlockCreateInput) =>
      apiFetch<Block>(`/api/plans/${planId}/blocks`, { method: 'POST', body: input }),
    FAMILIES,
  );

export const useCommitPlan = () =>
  useInvalidatingMutation((planId: string) => apiFetch<unknown>(`/api/plans/${planId}/commit`, { method: 'POST' }), FAMILIES);

export const useDiscardPlan = () =>
  useInvalidatingMutation((planId: string) => apiFetch<unknown>(`/api/plans/${planId}/discard`, { method: 'POST' }), FAMILIES);

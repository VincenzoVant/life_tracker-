import { useQuery } from '@tanstack/react-query';
import type { GoalSet } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk } from '../queryKeys';

export type { GoalSet };

export const useGoals = () => useQuery({ queryKey: qk.goals(), queryFn: () => apiFetch<GoalSet>('/api/goals') });

export const useSaveGoals = () =>
  useInvalidatingMutation((input: GoalSet) => apiFetch<GoalSet>('/api/goals', { method: 'PUT', body: input }), [
    'goals',
    'progress',
  ]);

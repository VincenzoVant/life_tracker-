import { useQuery } from '@tanstack/react-query';
import type { WorkoutType } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk } from '../queryKeys';

// TODO(stage1): import from @life-tracker/shared once server task lands
/** `null` means no goal. */
export interface GoalSet {
  startupMinutes: number | null;
  workoutsTotal: number | null;
  workoutsByType: Record<WorkoutType, number | null>;
  freeEvenings: number | null;
  dailyKcal: { target: number; tolerancePct: number } | null;
  dailyProteinG: number | null;
}

export const useGoals = () => useQuery({ queryKey: qk.goals(), queryFn: () => apiFetch<GoalSet>('/api/goals') });

export const useSaveGoals = () =>
  useInvalidatingMutation((input: GoalSet) => apiFetch<GoalSet>('/api/goals', { method: 'PUT', body: input }), [
    'goals',
    'progress',
  ]);

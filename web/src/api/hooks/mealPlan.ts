import { useQuery } from '@tanstack/react-query';
import type { MealPlanEntry, MealPlanEntryInput, MealSlot } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

export type { MealPlanEntry };

const FAMILIES: QueryFamily[] = ['food', 'progress'];

export const useMealPlan = (weekStart: string) =>
  useQuery({
    queryKey: qk.mealPlan(weekStart),
    queryFn: () => apiFetch<MealPlanEntry[]>(`/api/meal-plan?${new URLSearchParams({ weekStart })}`),
  });

export const useSetMealPlanEntry = () =>
  useInvalidatingMutation(
    ({ date, slot, ...body }: { date: string; slot: MealSlot } & MealPlanEntryInput) =>
      apiFetch<MealPlanEntry>(`/api/meal-plan/${date}/${slot}`, { method: 'PUT', body }),
    FAMILIES,
  );

export const useClearMealPlanEntry = () =>
  useInvalidatingMutation(
    ({ date, slot }: { date: string; slot: MealSlot }) =>
      apiFetch<unknown>(`/api/meal-plan/${date}/${slot}`, { method: 'DELETE' }),
    FAMILIES,
  );

export const useRepeatMealPlan = () =>
  useInvalidatingMutation(
    (weekStart: string) => apiFetch<{ copied: number }>('/api/meal-plan/repeat', { method: 'POST', body: { weekStart } }),
    FAMILIES,
  );

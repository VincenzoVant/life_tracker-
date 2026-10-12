import { useQuery } from '@tanstack/react-query';
import type { Meal, MealInput, MealLog, MealLogInput, MealUpdateInput } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const FOOD: QueryFamily[] = ['food'];
const LOG: QueryFamily[] = ['food', 'progress'];

export function useMeals(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = !!opts.includeArchived;
  return useQuery({
    queryKey: qk.meals(includeArchived),
    queryFn: () => apiFetch<Meal[]>(`/api/meals${includeArchived ? '?includeArchived=true' : ''}`),
  });
}

export const useCreateMeal = () =>
  useInvalidatingMutation((input: MealInput) => apiFetch<Meal>('/api/meals', { method: 'POST', body: input }), FOOD);
export const useUpdateMeal = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & MealUpdateInput) =>
      apiFetch<Meal>(`/api/meals/${id}`, { method: 'PATCH', body: patch }),
    FOOD,
  );
export const useArchiveMeal = () =>
  useInvalidatingMutation((id: string) => apiFetch<Meal>(`/api/meals/${id}`, { method: 'DELETE' }), FOOD);

export const useMealLogs = (date: string) =>
  useQuery({
    queryKey: qk.mealLogs(date),
    queryFn: () => apiFetch<MealLog[]>(`/api/meal-logs?${new URLSearchParams({ date })}`),
  });

export const useLogMeal = () =>
  useInvalidatingMutation(
    (input: MealLogInput) => apiFetch<MealLog>('/api/meal-logs', { method: 'POST', body: input }),
    LOG,
  );
export const useDeleteMealLog = () =>
  useInvalidatingMutation((id: string) => apiFetch<unknown>(`/api/meal-logs/${id}`, { method: 'DELETE' }), LOG);

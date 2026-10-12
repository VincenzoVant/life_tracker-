import { useQuery } from '@tanstack/react-query';
import type {
  Milestone,
  MilestoneInput,
  MilestoneUpdateInput,
  StartupTask,
  TaskInput,
  TaskUpdateInput,
} from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const F: QueryFamily[] = ['startup'];

export const useStartupTasks = () =>
  useQuery({ queryKey: qk.startupTasks(), queryFn: () => apiFetch<StartupTask[]>('/api/startup/tasks') });

export const useMilestones = () =>
  useQuery({ queryKey: qk.startupMilestones(), queryFn: () => apiFetch<Milestone[]>('/api/startup/milestones') });

export const useCreateTask = () =>
  useInvalidatingMutation(
    (input: TaskInput) => apiFetch<StartupTask>('/api/startup/tasks', { method: 'POST', body: input }),
    F,
  );
export const useUpdateTask = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & TaskUpdateInput) =>
      apiFetch<StartupTask>(`/api/startup/tasks/${id}`, { method: 'PATCH', body: patch }),
    F,
  );
export const useDeleteTask = () =>
  useInvalidatingMutation((id: string) => apiFetch<unknown>(`/api/startup/tasks/${id}`, { method: 'DELETE' }), F);
export const useReorderTasks = () =>
  useInvalidatingMutation(
    (ids: string[]) => apiFetch<unknown>('/api/startup/tasks/reorder', { method: 'POST', body: { ids } }),
    F,
  );

export const useCreateMilestone = () =>
  useInvalidatingMutation(
    (input: MilestoneInput) => apiFetch<Milestone>('/api/startup/milestones', { method: 'POST', body: input }),
    F,
  );
export const useUpdateMilestone = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & MilestoneUpdateInput) =>
      apiFetch<Milestone>(`/api/startup/milestones/${id}`, { method: 'PATCH', body: patch }),
    F,
  );
export const useDeleteMilestone = () =>
  useInvalidatingMutation(
    (id: string) => apiFetch<unknown>(`/api/startup/milestones/${id}`, { method: 'DELETE' }),
    F,
  );

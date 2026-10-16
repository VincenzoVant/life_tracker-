import { useQuery } from '@tanstack/react-query';
import type { Project, ProjectInput, ProjectUpdateInput, ProjectWithProgress } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const FAMILIES: QueryFamily[] = ['projects'];

export const useProjects = (weekStart: string) =>
  useQuery({
    queryKey: qk.projects(weekStart),
    queryFn: () => apiFetch<ProjectWithProgress[]>(`/api/projects?weekStart=${weekStart}`),
  });

export const useCreateProject = () =>
  useInvalidatingMutation((input: ProjectInput) => apiFetch<Project>('/api/projects', { method: 'POST', body: input }), FAMILIES);

export const useUpdateProject = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & ProjectUpdateInput) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: 'PATCH', body: patch }),
    FAMILIES,
  );

export const useDeleteProject = () =>
  useInvalidatingMutation((id: string) => apiFetch<Project>(`/api/projects/${id}`, { method: 'DELETE' }), FAMILIES);

import { useQuery } from '@tanstack/react-query';
import type { Course, CourseInput, CourseUpdateInput } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const FAMILIES: QueryFamily[] = ['courses', 'progress'];

export function useCourses(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = !!opts.includeArchived;
  return useQuery({
    queryKey: qk.courses(includeArchived),
    queryFn: () => apiFetch<Course[]>(`/api/courses${includeArchived ? '?includeArchived=true' : ''}`),
  });
}

export const useCreateCourse = () =>
  useInvalidatingMutation(
    (input: CourseInput) => apiFetch<Course>('/api/courses', { method: 'POST', body: input }),
    FAMILIES,
  );

export const useUpdateCourse = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & CourseUpdateInput) =>
      apiFetch<Course>(`/api/courses/${id}`, { method: 'PATCH', body: patch }),
    FAMILIES,
  );

export const useArchiveCourse = () =>
  useInvalidatingMutation((id: string) => apiFetch<Course>(`/api/courses/${id}`, { method: 'DELETE' }), FAMILIES);

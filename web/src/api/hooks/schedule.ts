import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FixedEvent, FixedEventInput } from '@life-tracker/shared';
import { apiFetch } from '../client';

const key = ['schedule'] as const;

export const useFixedEvents = () => useQuery({ queryKey: key, queryFn: () => apiFetch<FixedEvent[]>('/api/schedule') });

function useScheduleMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Fixed events materialize into blocks, so block queries go stale too.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['blocks'] })]),
  });
}

/** Creates when `id` is absent, otherwise PATCHes. */
export const useSaveFixedEvent = () =>
  useScheduleMutation(({ id, ...input }: { id?: string } & FixedEventInput) =>
    id
      ? apiFetch<FixedEvent>(`/api/schedule/${id}`, { method: 'PATCH', body: input })
      : apiFetch<FixedEvent>('/api/schedule', { method: 'POST', body: input }),
  );

export const useDeleteFixedEvent = () =>
  useScheduleMutation((id: string) => apiFetch<void>(`/api/schedule/${id}`, { method: 'DELETE' }));

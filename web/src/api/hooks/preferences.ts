import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Preferences } from '@life-tracker/shared';
import { apiFetch } from '../client';

const key = ['preferences'] as const;

export const usePreferences = () => useQuery({ queryKey: key, queryFn: () => apiFetch<Preferences>('/api/preferences') });

/** PUT with a partial object; `{}` resets to defaults. */
export const useSavePreferences = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Preferences>) => apiFetch<Preferences>('/api/preferences', { method: 'PUT', body: input }),
    onSuccess: (data) => qc.setQueryData(key, data),
  });
};

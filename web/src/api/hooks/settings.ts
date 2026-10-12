import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsInput } from '@life-tracker/shared';
import { apiFetch } from '../client';

export const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => apiFetch<SettingsInput>('/api/settings') });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => apiFetch<SettingsInput>('/api/settings', { method: 'PUT', body: input }),
    onSuccess: (data) => qc.setQueryData(settingsKey, data),
  });
}

/** The configured IANA timezone, falling back to the browser's until settings load. */
export function useTimezone(): string {
  const { data } = useSettings();
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

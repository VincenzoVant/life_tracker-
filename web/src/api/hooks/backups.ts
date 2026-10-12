import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupStatus } from '@life-tracker/shared';
import { apiFetch } from '../client';

const KEY = ['backups'] as const;

export const useBackups = () => useQuery({ queryKey: KEY, queryFn: () => apiFetch<BackupStatus>('/api/backups') });

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<BackupStatus>('/api/backups/run', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveBackupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dir: string }) => apiFetch<BackupStatus>('/api/backups/settings', { method: 'PUT', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

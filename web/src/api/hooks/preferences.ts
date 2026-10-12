import { useQuery } from '@tanstack/react-query';
import type { Preferences } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk } from '../queryKeys';

export const usePreferences = () =>
  useQuery({ queryKey: qk.preferences(), queryFn: () => apiFetch<Preferences>('/api/preferences') });

export const useSavePreferences = () =>
  useInvalidatingMutation(
    (input: Partial<Preferences>) => apiFetch<Preferences>('/api/preferences', { method: 'PUT', body: input }),
    ['preferences', 'progress'],
  );

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

/** Saves only the given top-level keys; the server merges them onto the stored preferences. */
export const usePatchPreferences = () =>
  useInvalidatingMutation(
    (input: Partial<Preferences>) => apiFetch<Preferences>('/api/preferences', { method: 'PATCH', body: input }),
    ['preferences', 'progress'],
  );

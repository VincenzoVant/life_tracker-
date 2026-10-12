import { useQuery } from '@tanstack/react-query';
import type { Preferences } from '@life-tracker/shared';
import { apiFetch } from '../client';

export function usePreferences() {
  return useQuery({ queryKey: ['preferences'] as const, queryFn: () => apiFetch<Preferences>('/api/preferences') });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthStatus, ChangePinInput } from '@life-tracker/shared';
import { apiFetch } from '../client';

export const authKey = ['auth'] as const;

export function useAuthStatus() {
  return useQuery({ queryKey: authKey, queryFn: () => apiFetch<AuthStatus>('/api/auth/status'), staleTime: Infinity });
}

function useAuthMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: authKey }),
  });
}

export const useSetupPin = () =>
  useAuthMutation((pin: string) => apiFetch('/api/auth/setup', { method: 'POST', body: { pin } }));

export const useLogin = () =>
  useAuthMutation((pin: string) => apiFetch('/api/auth/login', { method: 'POST', body: { pin } }));

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      await qc.invalidateQueries({ queryKey: authKey });
    },
  });
}

export const useChangePin = () =>
  useMutation({
    mutationFn: (input: ChangePinInput) => apiFetch('/api/auth/change-pin', { method: 'POST', body: input }),
  });

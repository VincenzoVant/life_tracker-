import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { QueryFamily } from './queryKeys';

export function invalidateFamilies(qc: QueryClient, families: QueryFamily[]) {
  return Promise.all(families.map((f) => qc.invalidateQueries({ queryKey: [f] })));
}

/** A mutation that invalidates the given query families on success. */
export function useInvalidatingMutation<V, R = unknown>(fn: (v: V) => Promise<R>, families: QueryFamily[]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateFamilies(qc, families) });
}

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { QueryFamily } from './queryKeys';

/** Families derived from another family's data: projects carry planned/done minutes from blocks, like progress. */
const DEPENDENTS: Partial<Record<QueryFamily, QueryFamily[]>> = { progress: ['projects'] };

export function invalidateFamilies(qc: QueryClient, families: QueryFamily[]) {
  const all = new Set(families.flatMap((f) => [f, ...(DEPENDENTS[f] ?? [])]));
  return Promise.all([...all].map((f) => qc.invalidateQueries({ queryKey: [f] })));
}

/** A mutation that invalidates the given query families on success. */
export function useInvalidatingMutation<V, R = unknown>(fn: (v: V) => Promise<R>, families: QueryFamily[]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateFamilies(qc, families) });
}

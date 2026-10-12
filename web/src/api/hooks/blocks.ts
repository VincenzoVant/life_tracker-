import { useQuery } from '@tanstack/react-query';
import type { Block, BlockCreateInput, BlockUpdateInput } from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const FAMILIES: QueryFamily[] = ['blocks', 'progress', 'review'];

/** `from`/`to` are ISO datetimes. */
export function useBlocks({ from, to }: { from: string; to: string }) {
  return useQuery({
    queryKey: qk.blocks(from, to),
    queryFn: () => apiFetch<Block[]>(`/api/blocks?${new URLSearchParams({ from, to })}`),
  });
}

export const useCreateBlock = () =>
  useInvalidatingMutation(
    (input: BlockCreateInput) => apiFetch<Block>('/api/blocks', { method: 'POST', body: input }),
    FAMILIES,
  );

export const useUpdateBlock = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & BlockUpdateInput) =>
      apiFetch<Block>(`/api/blocks/${id}`, { method: 'PATCH', body: patch }),
    FAMILIES,
  );

export const useRemoveBlock = () =>
  useInvalidatingMutation((id: string) => apiFetch<Block>(`/api/blocks/${id}`, { method: 'DELETE' }), FAMILIES);

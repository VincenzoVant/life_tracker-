import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BusyCalendarsInput,
  CalendarListItem,
  Block,
  Conflict,
  GoogleChange,
  GoogleStatus,
  ReplanDraft,
  SyncStatus,
} from '@life-tracker/shared';
import { ApiError, apiFetch } from '../client';

const STATUS = ['google', 'status'] as const;
const SYNC = ['google', 'sync'] as const;
const CALENDARS = ['google', 'calendars'] as const;
const CONFLICTS = ['google', 'conflicts'] as const;
const CHANGES = ['google', 'changes'] as const;

export const useGoogleStatus = () =>
  useQuery({ queryKey: STATUS, queryFn: () => apiFetch<GoogleStatus>('/api/google/status'), refetchInterval: 60_000 });

export const useSyncStatus = () => useQuery({ queryKey: SYNC, queryFn: () => apiFetch<SyncStatus>('/api/sync/status') });

export const useGoogleCalendars = (enabled = true) =>
  useQuery({ queryKey: CALENDARS, queryFn: () => apiFetch<CalendarListItem[]>('/api/google/calendars'), enabled });

export const useConflicts = () =>
  useQuery({ queryKey: CONFLICTS, queryFn: () => apiFetch<Conflict[]>('/api/conflicts?status=open') });

export const useGoogleChanges = () =>
  useQuery({ queryKey: CHANGES, queryFn: () => apiFetch<GoogleChange[]>('/api/google/changes?unseen=true') });

/** A mutation that refetches everything under the `google` key (and blocks, when Google may have changed them). */
function useGoogleMutation<V, R>(fn: (v: V) => Promise<R>, opts: { blocks?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['google'] }),
        ...(opts.blocks ? [qc.invalidateQueries({ queryKey: ['blocks'] })] : []),
      ]),
  });
}

export const useSyncNow = () =>
  useGoogleMutation(() => apiFetch<SyncStatus>('/api/sync/now', { method: 'POST' }), { blocks: true });

export const useSaveBusyCalendars = () =>
  useGoogleMutation((input: BusyCalendarsInput) =>
    apiFetch<GoogleStatus>('/api/google/busy-calendars', { method: 'PUT', body: input }),
  );

export const useDisconnectGoogle = () =>
  useGoogleMutation(() => apiFetch<GoogleStatus>('/api/google/disconnect', { method: 'POST' }));

export const useRecreateCalendar = () =>
  useGoogleMutation(() => apiFetch<GoogleStatus>('/api/google/recreate-calendar', { method: 'POST' }));

export const useDismissConflict = () =>
  useGoogleMutation((id: number) => apiFetch<Conflict>(`/api/conflicts/${id}/dismiss`, { method: 'POST' }));

export const useMarkChangesSeen = () =>
  useGoogleMutation((ids: number[]) => apiFetch<{ ok: true }>('/api/google/changes/seen', { method: 'POST', body: { ids } }));

/** `draft` is null when nothing needs to move (the conflict stays open). */
export const useReplanFromConflict = () =>
  useGoogleMutation(async (id: number): Promise<{ draft: ReplanDraft | null }> => {
    const res = await apiFetch<ReplanDraft | { draft: null }>(`/api/conflicts/${id}/replan`, { method: 'POST' });
    return 'plan' in res ? { draft: res } : { draft: null };
  });

/** One block by id; a 404 resolves to `null`. Used by the `/week?block=<id>` deep link. */
export const useBlockById = (id: string | null) =>
  useQuery({
    queryKey: ['blocks', 'one', id],
    enabled: !!id,
    retry: false,
    queryFn: async (): Promise<Block | null> => {
      try {
        return await apiFetch<Block>(`/api/blocks/${id}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

import { useQuery } from '@tanstack/react-query';
import type {
  Lift,
  LiftSummary,
  SessionInput,
  SessionUpdateInput,
  TopSet,
  TopSetInput,
  WorkoutSession,
} from '@life-tracker/shared';
import { apiFetch } from '../client';
import { useInvalidatingMutation } from '../invalidate';
import { qk, type QueryFamily } from '../queryKeys';

const SESSION_FAMILIES: QueryFamily[] = ['workouts', 'progress'];
const W: QueryFamily[] = ['workouts'];

/** `from`/`to` are local dates (YYYY-MM-DD). */
export function useWorkoutSessions({ from, to }: { from: string; to: string }) {
  return useQuery({
    queryKey: qk.workoutSessions(from, to),
    queryFn: () => apiFetch<WorkoutSession[]>(`/api/workouts/sessions?${new URLSearchParams({ from, to })}`),
  });
}

export const useCreateSession = () =>
  useInvalidatingMutation(
    (input: SessionInput) => apiFetch<WorkoutSession>('/api/workouts/sessions', { method: 'POST', body: input }),
    SESSION_FAMILIES,
  );
export const useUpdateSession = () =>
  useInvalidatingMutation(
    ({ id, ...patch }: { id: string } & SessionUpdateInput) =>
      apiFetch<WorkoutSession>(`/api/workouts/sessions/${id}`, { method: 'PATCH', body: patch }),
    SESSION_FAMILIES,
  );
export const useDeleteSession = () =>
  useInvalidatingMutation(
    (id: string) => apiFetch<unknown>(`/api/workouts/sessions/${id}`, { method: 'DELETE' }),
    SESSION_FAMILIES,
  );

export const useLifts = () => useQuery({ queryKey: qk.lifts(), queryFn: () => apiFetch<LiftSummary[]>('/api/lifts') });

export const useLiftHistory = (liftId: string) =>
  useQuery({ queryKey: qk.liftHistory(liftId), queryFn: () => apiFetch<TopSet[]>(`/api/lifts/${liftId}/sets`) });

export const useCreateLift = () =>
  useInvalidatingMutation((name: string) => apiFetch<Lift>('/api/lifts', { method: 'POST', body: { name } }), W);
export const useRenameLift = () =>
  useInvalidatingMutation(
    ({ id, name }: { id: string; name: string }) =>
      apiFetch<Lift>(`/api/lifts/${id}`, { method: 'PATCH', body: { name } }),
    W,
  );
export const useDeleteLift = () =>
  useInvalidatingMutation((id: string) => apiFetch<unknown>(`/api/lifts/${id}`, { method: 'DELETE' }), W);

export const useAddTopSet = () =>
  useInvalidatingMutation(
    ({ liftId, ...input }: { liftId: string } & TopSetInput) =>
      apiFetch<TopSet>(`/api/lifts/${liftId}/sets`, { method: 'POST', body: input }),
    W,
  );
export const useDeleteTopSet = () =>
  useInvalidatingMutation(
    ({ liftId, setId }: { liftId: string; setId: string }) =>
      apiFetch<unknown>(`/api/lifts/${liftId}/sets/${setId}`, { method: 'DELETE' }),
    W,
  );

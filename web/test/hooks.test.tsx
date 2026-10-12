import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { useBlocks, useCreateBlock } from '../src/api/hooks/blocks';
import { useLogMeal } from '../src/api/hooks/food';
import { useWeekProgress } from '../src/api/hooks/progress';
import { useSubmitReview, type ReviewSubmission } from '../src/api/hooks/review';
import { useReorderTasks } from '../src/api/hooks/startup';
import { mockApi } from './mockApi';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const invalidated = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
  return { queryClient, wrapper, invalidated };
}

test('useBlocks requests from/to and returns blocks', async () => {
  const from = '2026-10-12T07:00:00.000Z';
  const to = '2026-10-19T07:00:00.000Z';
  const seen: Array<[string | null, string | null]> = [];
  mockApi({
    'GET /api/blocks': (_b, url) => {
      seen.push([url.searchParams.get('from'), url.searchParams.get('to')]);
      return [{ id: 'b1', title: 'Study' }];
    },
  });
  const { wrapper } = setup();
  const { result } = renderHook(() => useBlocks({ from, to }), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'b1', title: 'Study' }]));
  expect(seen).toEqual([[from, to]]);
});

test('useCreateBlock invalidates blocks and progress queries', async () => {
  mockApi({ 'POST /api/blocks': () => ({ status: 201, body: { id: 'b1' } }) });
  const { wrapper, invalidated } = setup();
  const { result } = renderHook(() => useCreateBlock(), { wrapper });
  await act(() =>
    result.current.mutateAsync({
      category: 'rest',
      title: 'Nap',
      start: '2026-10-14T20:00:00.000Z',
      end: '2026-10-14T21:00:00.000Z',
    }),
  );
  expect(invalidated()).toEqual(expect.arrayContaining(['blocks', 'progress', 'review']));
});

test('useWeekProgress adds includeProposed=true only when requested', async () => {
  const seen: Array<string | null> = [];
  mockApi({
    'GET /api/progress/week': (_b, url) => {
      seen.push(url.searchParams.get('includeProposed'));
      return { weekStart: url.searchParams.get('weekStart') };
    },
  });
  const { wrapper } = setup();
  const a = renderHook(() => useWeekProgress('2026-10-12'), { wrapper });
  await waitFor(() => expect(a.result.current.data).toBeDefined());
  const b = renderHook(() => useWeekProgress('2026-10-12', { includeProposed: true }), { wrapper });
  await waitFor(() => expect(b.result.current.data).toBeDefined());
  expect(seen).toEqual([null, 'true']);
});

test('useSubmitReview posts the submission body verbatim', async () => {
  const api = mockApi({ 'POST /api/review': () => ({ date: '2026-10-14', progress: {} }) });
  const { wrapper, invalidated } = setup();
  const submission: ReviewSubmission = {
    date: '2026-10-14',
    entries: [{ blockId: 'b1', outcome: 'partial', actualMinutes: 30, completeStartupTask: true }],
    unplanned: [],
  };
  const { result } = renderHook(() => useSubmitReview(), { wrapper });
  await act(() => result.current.mutateAsync(submission));
  expect(api.calls[0]).toEqual({ method: 'POST', path: '/api/review', body: submission });
  expect(invalidated()).toEqual(expect.arrayContaining(['blocks', 'progress', 'review', 'workouts', 'startup']));
});

test('useReorderTasks posts ids', async () => {
  const api = mockApi({ 'POST /api/startup/tasks/reorder': () => [] });
  const { wrapper } = setup();
  const { result } = renderHook(() => useReorderTasks(), { wrapper });
  await act(() => result.current.mutateAsync(['t2', 't1']));
  expect(api.calls[0]).toEqual({ method: 'POST', path: '/api/startup/tasks/reorder', body: { ids: ['t2', 't1'] } });
});

test('useLogMeal invalidates food and progress', async () => {
  mockApi({ 'POST /api/meal-logs': () => ({ status: 201, body: { id: 'l1' } }) });
  const { wrapper, invalidated } = setup();
  const { result } = renderHook(() => useLogMeal(), { wrapper });
  await act(() => result.current.mutateAsync({ date: '2026-10-14', slot: 'lunch', mealId: 'm1', servings: 1 }));
  expect(invalidated()).toEqual(expect.arrayContaining(['food', 'progress']));
});

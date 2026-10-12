import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { WorkoutsPage } from '../src/features/areas/workouts/WorkoutsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T19:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const base = { blockId: null, intensity: null, notes: null, gymFocus: null, cardioKind: null, distanceKm: null, sportName: null, paceSecPerKm: null };
const sessions = [
  { ...base, id: 's1', type: 'gym', date: '2026-10-12', durationMinutes: 60 },
  { ...base, id: 's2', type: 'cardio', date: '2026-10-13', durationMinutes: 30, distanceKm: 5, paceSecPerKm: 360 },
];
const metric = (goal: number | null, actual: number) => ({ goal, planned: actual, actual });
const handlers = () => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/workouts/sessions': () => sessions,
  'GET /api/goals': () => ({ workoutsTotal: 4, workoutsByType: { gym: 2, cardio: 1, sport: null } }),
  'GET /api/progress/week': () => ({
    workouts: { total: metric(4, 2), byType: { gym: metric(2, 1), cardio: metric(1, 1), sport: metric(null, 0) } },
  }),
});

test('cardio session shows pace 6:00 /km for 5 km in 30 min', async () => {
  mockApi(handlers());
  renderWithProviders(<WorkoutsPage />);
  expect(await screen.findByText(/6:00 \/km/)).toBeInTheDocument();
  expect(screen.getByText(/5 km/)).toBeInTheDocument();
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
});

test('filter chips filter sessions by type', async () => {
  mockApi(handlers());
  renderWithProviders(<WorkoutsPage />);
  await screen.findByText(/6:00 \/km/);
  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Cardio' }));
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText('60 min')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Gym' }));
  expect(screen.getByText('60 min')).toBeInTheDocument();
  expect(screen.queryByText(/6:00 \/km/)).not.toBeInTheDocument();
});

test('log session posts type-specific fields', async () => {
  const { calls } = mockApi({ ...handlers(), 'POST /api/workouts/sessions': (b) => ({ ...base, id: 'n', ...b }) });
  renderWithProviders(<WorkoutsPage />);
  await screen.findByText(/6:00 \/km/);
  await userEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await userEvent.selectOptions(screen.getByLabelText('Type'), 'cardio');
  await userEvent.type(screen.getByLabelText('Duration (min)'), '30');
  await userEvent.type(screen.getByLabelText('Distance (km)'), '5');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ type: 'cardio', date: '2026-10-14', durationMinutes: 30, distanceKm: 5 });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { WorkoutsPage } from '../src/features/areas/workouts/WorkoutsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T19:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const base = { blockId: null, intensity: null, notes: null, gymFocus: null, cardioKind: null, distanceKm: null, sportName: null, paceSecPerKm: null };
const sessions = [
  { ...base, id: 's1', type: 'gym', date: '2026-10-12', durationMinutes: 60 },
  { ...base, id: 's2', type: 'cardio', date: '2026-10-13', durationMinutes: 30, distanceKm: 5, paceSecPerKm: 360 },
];
const metric = (goal: number | null, actual: number) => ({ goal, planned: actual, actual });
const goalSet = {
  startupMinutes: 600,
  workoutsTotal: 4,
  workoutsByType: { gym: 2, cardio: 1, sport: null },
  freeEvenings: 2,
  dailyKcal: { target: 2200, tolerancePct: 10 },
  dailyProteinG: 120,
};
const handlers = () => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/workouts/sessions': () => sessions,
  'GET /api/goals': () => goalSet,
  'GET /api/preferences': () => DEFAULT_PREFERENCES,
  'GET /api/progress/week': () => ({
    workouts: { total: metric(4, 2), byType: { gym: metric(2, 1), cardio: metric(1, 1), sport: metric(null, 0) } },
  }),
});

async function renderSessions() {
  renderWithProviders(<WorkoutsPage />);
  await userEvent.click(await screen.findByRole('tab', { name: 'Sessions' }));
}

test('cardio session shows pace 6:00 /km for 5 km in 30 min', async () => {
  mockApi(handlers());
  await renderSessions();
  expect(await screen.findByText(/6:00 \/km/)).toBeInTheDocument();
  expect(screen.getByText(/5 km/)).toBeInTheDocument();
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
});

test('filter chips filter sessions by type', async () => {
  mockApi(handlers());
  await renderSessions();
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

test('edit a logged session patches it with the changed values', async () => {
  const { calls } = mockApi({ ...handlers(), 'PATCH /api/workouts/sessions/s2': (b) => ({ ...sessions[1], ...b }) });
  await renderSessions();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Cardio session 2026-10-13' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit session' });
  const duration = within(dialog).getByLabelText('Duration (min)');
  expect(duration).toHaveValue(30);
  expect(within(dialog).getByLabelText('Distance (km)')).toHaveValue(5);
  await userEvent.clear(duration);
  await userEvent.type(duration, '35');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  expect(calls.find((c) => c.method === 'PATCH')!.path).toBe('/api/workouts/sessions/s2');
  expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ type: 'cardio', date: '2026-10-13', durationMinutes: 35, distanceKm: 5 });
});

test('emptying optional fields in the edit form sends null to clear them', async () => {
  const withDetails = { ...sessions[1], intensity: 3, notes: 'easy', cardioKind: 'run' };
  const { calls } = mockApi({ ...handlers(), 'GET /api/workouts/sessions': () => [sessions[0], withDetails], 'PATCH /api/workouts/sessions/s2': (b) => ({ ...withDetails, ...b }) });
  await renderSessions();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Cardio session 2026-10-13' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit session' });
  await userEvent.clear(within(dialog).getByLabelText('Distance (km)'));
  await userEvent.clear(within(dialog).getByLabelText('Intensity (1-5)'));
  await userEvent.clear(within(dialog).getByLabelText('Notes'));
  await userEvent.clear(within(dialog).getByLabelText('Kind'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ distanceKm: null, intensity: null, notes: null, cardioKind: null });
});

test('delete a logged session asks for confirmation first', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const { calls } = mockApi({ ...handlers(), 'DELETE /api/workouts/sessions/s1': () => ({ status: 204, body: null }) });
  await renderSessions();
  const del = await screen.findByRole('button', { name: 'Delete Gym session 2026-10-12' });
  await userEvent.click(del);
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  await userEvent.click(del);
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/workouts/sessions/s1')).toBe(true));
  confirm.mockRestore();
});

test('log session posts type-specific fields', async () => {
  const { calls } = mockApi({ ...handlers(), 'POST /api/workouts/sessions': (b) => ({ ...base, id: 'n', ...b }) });
  await renderSessions();
  await screen.findByText(/6:00 \/km/);
  await userEvent.click(screen.getByRole('button', { name: 'Log session' }));
  await userEvent.selectOptions(screen.getByLabelText('Type'), 'cardio');
  await userEvent.type(screen.getByLabelText('Duration (min)'), '30');
  await userEvent.type(screen.getByLabelText('Distance (km)'), '5');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ type: 'cardio', date: '2026-10-14', durationMinutes: 30, distanceKm: 5 });
});

test('Schedule is the first tab and the Top lifts link stays', async () => {
  mockApi(handlers());
  renderWithProviders(<WorkoutsPage />);
  expect(await screen.findByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('link', { name: 'Top lifts' })).toHaveAttribute('href', '/areas/workouts/lifts');
  expect(await screen.findByText('Any time of the day')).toBeInTheDocument();
});

test('saving the schedule patches only the workout preference keys', async () => {
  const { calls } = mockApi({ ...handlers(), 'PATCH /api/preferences': (b) => ({ ...DEFAULT_PREFERENCES, ...b }) });
  renderWithProviders(<WorkoutsPage />);
  const gym = await screen.findByLabelText('Gym duration (min)');
  await userEvent.clear(gym);
  await userEvent.type(gym, '60');
  await userEvent.click(screen.getByRole('button', { name: 'Add available window' }));
  const after = screen.getByLabelText('Workout buffer after (min)');
  await userEvent.clear(after);
  await userEvent.type(after, '45');
  await userEvent.click(screen.getByRole('button', { name: 'Allowed workout days: Sunday' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
    workoutDurations: { gym: 60, cardio: 45, sport: 90 },
    workoutAvailability: [{ days: [1, 2, 3, 4, 5], start: '07:00', end: '21:00' }],
    preferredWorkoutWindows: DEFAULT_PREFERENCES.preferredWorkoutWindows,
    allowedWorkoutDays: [1, 2, 3, 4, 5, 6],
    minHoursBetweenGym: 40,
    workoutBuffer: { before: 15, after: 45 },
  });
  expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  expect(await screen.findByText('Workout schedule saved')).toBeInTheDocument();
});

test('changing how often saves the whole goal set with only the workout goals changed', async () => {
  const { calls } = mockApi({
    ...handlers(),
    'PATCH /api/preferences': (b) => ({ ...DEFAULT_PREFERENCES, ...b }),
    'PUT /api/goals': (b) => b,
  });
  renderWithProviders(<WorkoutsPage />);
  const sport = await screen.findByLabelText('Sport workouts per week');
  expect(screen.getByLabelText('No goal for Sport workouts per week')).toBeChecked();
  await userEvent.type(sport, '1');
  await userEvent.click(screen.getByLabelText('No goal for Gym workouts per week'));
  await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
  expect(calls.find((c) => c.method === 'PUT' && c.path === '/api/goals')!.body).toEqual({
    ...goalSet,
    workoutsByType: { gym: null, cardio: 1, sport: 1 },
  });
});

test('server field errors show next to the schedule fields', async () => {
  mockApi({
    ...handlers(),
    'GET /api/preferences': () => ({ ...DEFAULT_PREFERENCES, workoutAvailability: [{ days: [1], start: '19:00', end: '18:00' }] }),
    'PATCH /api/preferences': () => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION',
          message: 'Invalid preferences',
          fields: {
            'workoutDurations.gym': 'Number must be greater than 0',
            'workoutAvailability.0.start': 'start must be before end',
            'workoutBuffer.after': 'Number must be less than or equal to 240',
            mystery: 'Something else',
          },
        },
      },
    }),
  });
  renderWithProviders(<WorkoutsPage />);
  await userEvent.clear(await screen.findByLabelText('Gym duration (min)'));
  await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  expect(await screen.findByText('Number must be greater than 0')).toBeInTheDocument();
  expect(screen.getByLabelText('Gym duration (min)')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Available window 1 start')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('start must be before end')).toBeInTheDocument();
  expect(screen.getByLabelText('Workout buffer after (min)')).toHaveAttribute('aria-invalid', 'true');
  expect(within(screen.getByRole('alert', { name: 'Other problems' })).getByText(/Something else/)).toBeInTheDocument();
});

test('the week preview lists where a workout could go', async () => {
  mockApi({
    ...handlers(),
    'GET /api/preferences': () => ({
      ...DEFAULT_PREFERENCES,
      workoutAvailability: [{ days: [2, 4], start: '06:30', end: '08:30' }, { days: [4], start: '18:00', end: '20:00' }],
      allowedWorkoutDays: [2, 3, 4],
      preferredWorkoutWindows: [{ days: [4], start: '18:00', end: '19:00' }],
    }),
  });
  renderWithProviders(<WorkoutsPage />);
  const preview = await screen.findByRole('list', { name: 'Workout possibilities per day' });
  const row = (day: string) => within(preview).getByText(day).closest('li')!;
  expect(row('Mon')).toHaveTextContent('No workouts');
  expect(row('Tue')).toHaveTextContent('06:30–08:30');
  expect(row('Wed')).toHaveTextContent('Not available');
  expect(row('Thu')).toHaveTextContent('06:30–08:30, 18:00–20:00 · prefers 18:00–19:00');
  await userEvent.click(screen.getByRole('button', { name: 'Allowed workout days: Tuesday' }));
  expect(row('Tue')).toHaveTextContent('No workouts');
});

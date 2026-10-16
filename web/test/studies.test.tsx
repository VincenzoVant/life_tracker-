import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { StudiesPage } from '../src/features/areas/studies/StudiesPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const course = { id: 'c1', name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 360, active: true, createdAt: '', updatedAt: '' };
const progress = {
  weekStart: '2026-10-12',
  study: [{ courseId: 'c1', name: 'Algorithms', color: '#3f51b5', goal: 360, planned: 300, actual: 180 }],
};
const base = () => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/courses': () => [course],
  'GET /api/progress/week': () => progress,
  'GET /api/preferences': () => DEFAULT_PREFERENCES,
});

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('studies shows hours progress per course and saves weekly hours as minutes', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'POST /api/courses': () => ({ status: 201, body: course }) });
  renderWithProviders(<StudiesPage />);

  expect(await screen.findByText('3.0 / 6.0 h')).toBeInTheDocument();
  expect(screen.getByText('Planned 5.0 h')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Add course' }));
  await user.type(screen.getByLabelText('Name'), 'Databases');
  await user.clear(screen.getByLabelText('Weekly hours'));
  await user.type(screen.getByLabelText('Weekly hours'), '6');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Databases', color: '#3f51b5', weeklyGoalMinutes: 360 }),
  );
});

test('edit course sends changed hours as minutes via PATCH', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'PATCH /api/courses/c1': () => course });
  renderWithProviders(<StudiesPage />);
  await user.click(await screen.findByRole('button', { name: 'Edit Algorithms' }));
  await user.clear(screen.getByLabelText('Weekly hours'));
  await user.type(screen.getByLabelText('Weekly hours'), '2.5');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ weeklyGoalMinutes: 150 }));
});

test('archive course asks confirmation and calls DELETE', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const { calls } = mockApi({ ...base(), 'DELETE /api/courses/c1': () => ({ ...course, active: false }) });
  renderWithProviders(<StudiesPage />);
  const card = await screen.findByRole('listitem', { name: 'Algorithms' });
  await user.click(within(card).getByRole('button', { name: 'Archive Algorithms' }));
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  await user.click(within(card).getByRole('button', { name: 'Archive Algorithms' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/courses/c1')).toBe(true));
  expect(confirm).toHaveBeenCalledTimes(2);
});

test('courses tab shows weekly hours per course and the summary against available time', async () => {
  mockApi(base());
  renderWithProviders(<StudiesPage />);
  expect(await screen.findByText('6.0 h / week')).toBeInTheDocument();
  const summary = await screen.findByLabelText('Study summary');
  expect(within(summary).getByText('6.0 h')).toBeInTheDocument();
  // No study windows: 08:00-22:30 every day = 101.5 h.
  expect(within(summary).getByText('Free in your days')).toBeInTheDocument();
  expect(within(summary).getByText('101.5 h')).toBeInTheDocument();
  expect(within(summary).queryByRole('status')).toBeNull();
});

test('summary warns when the course goals exceed the study windows', async () => {
  mockApi({
    ...base(),
    'GET /api/preferences': () => ({
      ...DEFAULT_PREFERENCES,
      studyWindows: [
        { days: [1, 3], start: '09:00', end: '11:00' },
        { days: [1], start: '10:00', end: '11:30' },
      ],
    }),
  });
  renderWithProviders(<StudiesPage />);
  const summary = await screen.findByLabelText('Study summary');
  // Monday 09:00-11:30 (overlap counted once) + Wednesday 2 h = 4.5 h.
  expect(within(summary).getByText('Inside your study windows')).toBeInTheDocument();
  expect(within(summary).getByText('4.5 h')).toBeInTheDocument();
  expect(within(summary).getByRole('status')).toHaveTextContent('need 1.5 h more');
});

test('study hours tab saves only the study keys with PATCH', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'PATCH /api/preferences': (body) => ({ ...DEFAULT_PREFERENCES, ...body }) });
  renderWithProviders(<StudiesPage />);
  await user.click(await screen.findByRole('tab', { name: 'Study hours' }));
  expect(screen.getByText('Any time between your earliest and latest block')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/areas/classes');

  await user.click(screen.getByRole('button', { name: 'Add study window' }));
  await user.click(screen.getByRole('button', { name: 'Study window 1 days: Friday' }));
  await user.click(screen.getByRole('button', { name: 'Add preferred study window' }));
  const prefStart = screen.getByLabelText('Preferred study window 1 start');
  await user.clear(prefStart);
  await user.type(prefStart, '10:00');
  const max = screen.getByLabelText('Study block max (min)');
  await user.clear(max);
  await user.type(max, '90');
  await user.click(screen.getByLabelText('Classes count toward study'));
  await user.click(screen.getByRole('button', { name: 'Save study hours' }));

  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
  expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
    studyWindows: [{ days: [1, 2, 3, 4], start: '09:00', end: '12:00' }],
    preferredStudyWindows: [{ days: [1, 2, 3, 4, 5], start: '10:00', end: '12:00' }],
    studyBlock: { min: 45, max: 90 },
    maxStudyMinutesPerDay: 300,
    maxMinutesPerCoursePerDay: 180,
    classesCountTowardStudy: true,
  });
  expect(calls.some((c) => c.method === 'PUT')).toBe(false);
});

test('study hours tab shows server field errors next to their fields', async () => {
  const user = userEvent.setup();
  mockApi({
    ...base(),
    'GET /api/preferences': () => ({ ...DEFAULT_PREFERENCES, studyWindows: [{ days: [1], start: '09:00', end: '12:00' }] }),
    'PATCH /api/preferences': () => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION',
          message: 'Invalid preferences',
          fields: {
            'studyBlock.min': 'min must be a multiple of 15',
            'studyWindows.0.start': 'start must be before end',
            latestBlockEnd: 'Preferences leave less than an hour per day',
          },
        },
      },
    }),
  });
  renderWithProviders(<StudiesPage />);
  await user.click(await screen.findByRole('tab', { name: 'Study hours' }));
  const min = screen.getByLabelText('Study block min (min)');
  await user.clear(min);
  await user.type(min, '50');
  await user.click(screen.getByRole('button', { name: 'Save study hours' }));

  expect(await screen.findByText('min must be a multiple of 15')).toBeInTheDocument();
  expect(screen.getByLabelText('Study block min (min)')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Study window 1 start')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert', { name: 'Other problems' })).toHaveTextContent('latestBlockEnd: Preferences leave less than an hour per day');
});

test('a cleared numeric field is sent as null so the server rejects it instead of saving 0', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({
    ...base(),
    'PATCH /api/preferences': () => ({
      status: 400,
      body: { error: { code: 'VALIDATION', message: 'Invalid preferences', fields: { maxStudyMinutesPerDay: 'Expected number, received null' } } },
    }),
  });
  renderWithProviders(<StudiesPage />);
  await user.click(await screen.findByRole('tab', { name: 'Study hours' }));
  await user.clear(screen.getByLabelText('Max study per day (min)'));
  expect(screen.getByLabelText('Max study per day (min)')).toHaveValue(null);
  await user.click(screen.getByRole('button', { name: 'Save study hours' }));
  expect(await screen.findByText('Expected number, received null')).toBeInTheDocument();
  expect((calls.find((c) => c.method === 'PATCH')?.body as Record<string, unknown>).maxStudyMinutesPerDay).toBeNull();
});

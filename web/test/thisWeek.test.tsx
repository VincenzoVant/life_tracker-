import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ThisWeekPage } from '../src/features/areas/thisWeek/ThisWeekPage';
import { describeShortfall } from '../src/features/week/DraftPanel';
import { mockApi, type Handler } from './mockApi';
import { renderWithProviders } from './render';

const project = (over: Record<string, unknown>) => ({
  id: 'p1', title: 'Midterm prep', kind: 'study', courseId: 'c1', weeklyMinutes: 240, weekStart: null, windows: [],
  blockMin: 60, blockMax: 120, priority: 1, active: true, createdAt: '', updatedAt: '', plannedMinutes: 180, doneMinutes: 60,
  ...over,
});
const projects = [
  project({}),
  project({ id: 'p2', title: 'Sauna', kind: 'relax', courseId: null, weeklyMinutes: 120, weekStart: '2026-10-12', priority: 2, plannedMinutes: 0, doneMinutes: 0 }),
];
const goals = {
  startupMinutes: 300, workoutsTotal: 3, workoutsByType: { gym: 2, cardio: null, sport: null }, freeEvenings: 2,
  dailyKcal: { target: 2500, tolerancePct: 10 }, dailyProteinG: 150,
};
const course = { id: 'c1', name: 'Econometrics', color: '#3f51b5', weeklyGoalMinutes: 360, active: true, createdAt: '', updatedAt: '' };

function base(weeks: string[] = []): Record<string, Handler> {
  return {
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/projects': (_b, url) => {
      weeks.push(url.searchParams.get('weekStart')!);
      return url.searchParams.get('weekStart') === '2026-10-12' ? projects : [];
    },
    'GET /api/courses': () => [course],
    'GET /api/goals': () => goals,
    'GET /api/preferences': () => DEFAULT_PREFERENCES,
  };
}

// Wed 2026-10-14 12:00 in Los Angeles: this week starts Mon 2026-10-12.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => vi.useRealTimers());

test('lists the week’s projects by kind with progress, totals and a link to plan the week', async () => {
  mockApi(base());
  renderWithProviders(<ThisWeekPage />);
  const study = await screen.findByRole('list', { name: 'Study' });
  const card = within(study).getByRole('listitem', { name: 'Midterm prep' });
  expect(within(card).getByText('4.0 h/week')).toBeInTheDocument();
  expect(within(card).getByText('Every week')).toBeInTheDocument();
  expect(within(card).getByText('High priority')).toBeInTheDocument();
  expect(within(card).getByText('Done 1.0 / 4.0 h')).toBeInTheDocument();
  expect(within(card).getByText('Planned 3.0 h')).toBeInTheDocument();
  expect(within(card).getByRole('progressbar', { name: 'Midterm prep progress' })).toHaveAttribute('aria-valuenow', '60');
  const relax = screen.getByRole('list', { name: 'Relax' });
  expect(within(relax).getByText('This week only')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Fun' })).not.toBeInTheDocument();

  const totals = await screen.findByLabelText('Hours this week');
  // 4 h projects + 6 h courses + 5 h startup; relax is listed apart. Room: 8 h × Wed..Sun.
  await waitFor(() => expect(totals).toHaveTextContent('Wanted: 15.0 h'));
  expect(totals).toHaveTextContent('+ 2.0 h relax');
  expect(totals).toHaveTextContent('Room: about 40.0 h of planned work (8.0 h a day × 5 days)');
  expect(screen.getByRole('link', { name: 'Plan this week' })).toHaveAttribute('href', '/week?week=2026-10-12');
});

test('the week switcher loads another week', async () => {
  const user = userEvent.setup();
  const weeks: string[] = [];
  mockApi(base(weeks));
  renderWithProviders(<ThisWeekPage />);
  await screen.findByText('Midterm prep');
  await user.click(screen.getByRole('button', { name: 'Next week' }));
  expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  expect(screen.getByText('Week of 2026-10-19')).toBeInTheDocument();
  expect(weeks).toContain('2026-10-19');
  expect(screen.getByRole('link', { name: 'Plan this week' })).toHaveAttribute('href', '/week?week=2026-10-19');
  await user.click(screen.getByRole('button', { name: 'This week' }));
  expect(await screen.findByText('Midterm prep')).toBeInTheDocument();
});

test('adds a study project for this week only, with a course, preferred time and block sizes', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'POST /api/projects': (b) => ({ status: 201, body: { ...project({}), ...b } }) });
  renderWithProviders(<ThisWeekPage />);
  await screen.findByText('Midterm prep');
  await user.click(screen.getByRole('button', { name: 'Add project' }));
  const dialog = screen.getByRole('dialog', { name: 'Add project' });
  await user.type(within(dialog).getByLabelText('Title'), 'Final exam');
  await user.selectOptions(within(dialog).getByLabelText('Course'), 'c1');
  await user.clear(within(dialog).getByLabelText('Hours this week'));
  await user.type(within(dialog).getByLabelText('Hours this week'), '1.5');
  await user.click(within(dialog).getByLabelText('Only this week'));
  await user.click(within(dialog).getByRole('button', { name: 'Add preferred time' }));
  await user.clear(within(dialog).getByLabelText('Shortest block (min)'));
  await user.type(within(dialog).getByLabelText('Shortest block (min)'), '45');
  await user.selectOptions(within(dialog).getByLabelText('Priority'), '3');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Final exam', kind: 'study', courseId: 'c1', weeklyMinutes: 90, weekStart: '2026-10-12',
      windows: [{ days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' }], blockMin: 45, blockMax: 120, priority: 3,
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('shows server field errors in the form', async () => {
  const user = userEvent.setup();
  mockApi({
    ...base(),
    'POST /api/projects': () => ({
      status: 400,
      body: { error: { code: 'VALIDATION', message: 'Invalid input', fields: { courseId: 'Pick a course for a study project' } } },
    }),
  });
  renderWithProviders(<ThisWeekPage />);
  await screen.findByText('Midterm prep');
  await user.click(screen.getByRole('button', { name: 'Add project' }));
  const dialog = screen.getByRole('dialog', { name: 'Add project' });
  await user.type(within(dialog).getByLabelText('Title'), 'Exam');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByText('Pick a course for a study project')).toBeInTheDocument();
});

test('edits a project (fun has no course) and deletes one after confirming', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
  const { calls } = mockApi({
    ...base(),
    'PATCH /api/projects/p1': (b) => ({ ...project({}), ...b }),
    'DELETE /api/projects/p2': () => projects[1],
  });
  renderWithProviders(<ThisWeekPage />);
  await user.click(await screen.findByRole('button', { name: 'Edit Midterm prep' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit project' });
  await user.selectOptions(within(dialog).getByLabelText('Kind'), 'fun');
  expect(within(dialog).queryByLabelText('Course')).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ kind: 'fun', courseId: null, weekStart: null }));

  await user.click(screen.getByRole('button', { name: 'Delete Sauna' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/projects/p2')).toBe(true));
});

test('startup hours and free evenings save the whole goal set with only those changed', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'PUT /api/goals': (b) => b });
  renderWithProviders(<ThisWeekPage />);
  const startup = await screen.findByLabelText('Startup hours per week');
  expect(startup).toHaveValue(5);
  await user.clear(startup);
  await user.type(startup, '7.5');
  await user.clear(screen.getByLabelText('Free evenings per week'));
  await user.click(screen.getByRole('button', { name: 'Save goals' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ ...goals, startupMinutes: 450, freeEvenings: null }),
  );
});

test('project shortfalls are labelled with the project title on the Week draft', () => {
  expect(describeShortfall({ kind: 'project', projectId: 'p1', projectTitle: 'Guitar', missing: 90, unit: 'minutes' }, 0)).toBe(
    "Can't fit: 1.5 h of Guitar",
  );
});

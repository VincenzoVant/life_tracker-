import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TopLiftsPage } from '../src/features/areas/workouts/TopLiftsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T19:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const set = { id: 't1', liftId: 'l1', date: '2026-10-10', weightKg: 100, reps: 3, notes: null };
const summaries = [
  { lift: { id: 'l1', name: 'Squat', sortOrder: 0 }, prs: { heaviest: set, bestE1rm: { value: 110, set } }, lastSet: set },
  { lift: { id: 'l2', name: 'Bench', sortOrder: 1 }, prs: { heaviest: null, bestE1rm: null }, lastSet: null },
];
const handlers = () => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/lifts': () => summaries,
});

test('lift card shows heaviest and e1RM; add top set posts weightKg and reps', async () => {
  const { calls } = mockApi({ ...handlers(), 'POST /api/lifts/l1/sets': (b) => ({ id: 'n', liftId: 'l1', notes: null, ...b }) });
  renderWithProviders(<TopLiftsPage />);
  const card = await screen.findByRole('article', { name: 'Squat' });
  expect(within(card).getByText('100 kg × 3')).toBeInTheDocument();
  expect(within(card).getByText('e1RM 110.0 kg')).toBeInTheDocument();
  expect(within(card).getByText(/2026-10-10/)).toBeInTheDocument();

  await userEvent.click(within(card).getByRole('button', { name: 'Add top set' }));
  expect(screen.getByLabelText('Date')).toHaveValue('2026-10-14');
  await userEvent.type(screen.getByLabelText('Weight (kg)'), '102.5');
  await userEvent.type(screen.getByLabelText('Reps'), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ date: '2026-10-14', weightKg: 102.5, reps: 2 });
});

test('delete lift disabled when it has sets', async () => {
  mockApi(handlers());
  renderWithProviders(<TopLiftsPage />);
  const squat = await screen.findByRole('article', { name: 'Squat' });
  expect(within(squat).getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(within(squat).getByText('Delete its sets first')).toBeInTheDocument();
  const bench = screen.getByRole('article', { name: 'Bench' });
  expect(within(bench).getByRole('button', { name: 'Delete' })).toBeEnabled();
});

test('selecting a lift shows newest-first history and an accessible chart', async () => {
  const older = { ...set, id: 't0', date: '2026-09-01', weightKg: 90, reps: 5 };
  mockApi({ ...handlers(), 'GET /api/lifts/l1/sets': () => [older, set] });
  renderWithProviders(<TopLiftsPage />);
  const card = await screen.findByRole('article', { name: 'Squat' });
  await userEvent.click(within(card).getByRole('button', { name: 'History' }));
  const chart = await screen.findByRole('img', { name: /Squat estimated 1RM over time/ });
  expect(chart.tagName.toLowerCase()).toBe('svg');
  const items = screen.getAllByRole('listitem');
  expect(items[0]).toHaveTextContent('2026-10-10');
  expect(items[1]).toHaveTextContent('2026-09-01');
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StartupPage } from '../src/features/areas/startup/StartupPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const task = (id: string, title: string, sortOrder: number, status = 'todo', milestoneId: string | null = 'm1') => ({
  id,
  title,
  status,
  milestoneId,
  sortOrder,
  doneAt: null,
});
const tasks = [task('t1', 'Landing page', 0), task('t2', 'Pricing', 1), task('t3', 'Inbox zero', 2, 'todo', null)];
const base = () => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/startup/tasks': () => tasks,
  'GET /api/startup/milestones': () => [{ id: 'm1', title: 'Launch', targetDate: '2026-11-01', doneAt: null, sortOrder: 0 }],
  'GET /api/progress/week': () => ({ weekStart: '2026-10-12', startup: { goal: 600, planned: 480, actual: 270 } }),
});

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => vi.useRealTimers());

test('startup groups tasks by milestone and shows hours against goal', async () => {
  mockApi(base());
  renderWithProviders(<StartupPage />);
  expect(await screen.findByRole('heading', { name: 'Launch' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'No milestone' })).toBeInTheDocument();
  expect(screen.getByText('Inbox zero')).toBeInTheDocument();
  expect(await screen.findByText('4.5 / 10.0 h')).toBeInTheDocument();
});

test('startup keeps the No milestone group with an empty-state line when it has no tasks', async () => {
  mockApi({ ...base(), 'GET /api/startup/tasks': () => tasks.slice(0, 2) });
  renderWithProviders(<StartupPage />);
  expect(await screen.findByRole('heading', { name: 'No milestone' })).toBeInTheDocument();
  expect(await screen.findByText('No tasks without a milestone')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'No milestone' })).toBeInTheDocument();
});

test('startup move task down calls reorder with new order', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'POST /api/startup/tasks/reorder': () => ({}) });
  renderWithProviders(<StartupPage />);
  await user.click(await screen.findByRole('button', { name: 'Move Landing page down' }));
  await waitFor(() => expect(calls.find((c) => c.path === '/api/startup/tasks/reorder')?.body).toEqual({ ids: ['t2', 't1', 't3'] }));
});

test('startup task status change to done calls PATCH', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'PATCH /api/startup/tasks/t1': () => task('t1', 'Landing page', 0, 'done') });
  renderWithProviders(<StartupPage />);
  await user.selectOptions(await screen.findByLabelText('Status of Landing page'), 'done');
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'done' }));
});

test('startup deletes a task and a milestone only after confirmation', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
  const { calls } = mockApi({
    ...base(),
    'DELETE /api/startup/tasks/t1': () => ({ status: 204, body: null }),
    'DELETE /api/startup/milestones/m1': () => ({ status: 204, body: null }),
  });
  renderWithProviders(<StartupPage />);
  const del = await screen.findByRole('button', { name: 'Delete Landing page' });
  await user.click(del);
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  await user.click(del);
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/startup/tasks/t1')).toBe(true));
  await user.click(screen.getByRole('button', { name: 'Delete milestone Launch' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/startup/milestones/m1')).toBe(true));
  confirm.mockRestore();
});

test('startup adds a task under a milestone', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ ...base(), 'POST /api/startup/tasks': () => ({ status: 201, body: tasks[0] }) });
  renderWithProviders(<StartupPage />);
  await user.click(await screen.findByRole('button', { name: 'Add task' }));
  await user.type(screen.getByLabelText('Title'), 'Write docs');
  await user.selectOptions(screen.getByLabelText('Milestone'), 'm1');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ title: 'Write docs', milestoneId: 'm1' }));
});

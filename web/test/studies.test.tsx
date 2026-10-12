import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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
});

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => vi.useRealTimers());

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

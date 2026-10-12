import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BlockForm } from '../src/features/blocks/BlockForm';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
});
afterEach(() => vi.useRealTimers());

const settings = { 'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }) };
const courses = {
  'GET /api/courses': () => [{ id: 'c1', name: 'Algorithms', color: '#111', weeklyGoalMinutes: 300, active: true, createdAt: '', updatedAt: '' }],
};

async function fill(user: ReturnType<typeof userEvent.setup>, start: string, end: string) {
  await user.type(screen.getByLabelText('Title'), 'Problem set');
  await user.clear(screen.getByLabelText('Date'));
  await user.type(screen.getByLabelText('Date'), '2026-10-14');
  await user.clear(screen.getByLabelText('Start'));
  await user.type(screen.getByLabelText('Start'), start);
  await user.clear(screen.getByLabelText('End'));
  await user.type(screen.getByLabelText('End'), end);
}

describe('BlockForm', () => {
  test('converts local 19:00 LA to 02:00Z next day and posts courseId only for study', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ ...settings, ...courses, 'POST /api/blocks': (b) => ({ id: 'x', ...b }) });
    const onDone = vi.fn();
    renderWithProviders(<BlockForm onDone={onDone} />);

    await user.selectOptions(screen.getByLabelText('Category'), 'study');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Course' }), 'c1');
    await fill(user, '19:00', '20:00');
    await user.click(screen.getByRole('button', { name: 'Add block' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      category: 'study', title: 'Problem set', start: '2026-10-15T02:00:00.000Z', end: '2026-10-15T03:00:00.000Z',
      courseId: 'c1', startupTaskId: null, workoutType: null, mealSlot: null,
    });

    // switching the category away from study drops the course link
    await user.selectOptions(screen.getByLabelText('Category'), 'rest');
    expect(screen.queryByLabelText('Course')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add block' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    expect(calls.filter((c) => c.method === 'POST')[1]?.body).toMatchObject({ category: 'rest', courseId: null });
  });

  test('BlockForm shows server field error under End', async () => {
    const user = userEvent.setup();
    mockApi({
      ...settings,
      'POST /api/blocks': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { end: 'End must be after start' } } },
      }),
    });
    const onDone = vi.fn();
    renderWithProviders(<BlockForm onDone={onDone} />);
    await fill(user, '10:00', '11:00');
    await user.click(screen.getByRole('button', { name: 'Add block' }));

    const end = screen.getByLabelText('End');
    expect(await screen.findByText('End must be after start')).toBeInTheDocument();
    expect(end).toHaveAccessibleDescription('End must be after start');
    expect(onDone).not.toHaveBeenCalled();
  });
});

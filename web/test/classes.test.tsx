import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type FixedEvent } from '@life-tracker/shared';
import { ClassesPage } from '../src/features/areas/classes/ClassesPage';
import { mockApi, type Handler } from './mockApi';
import { renderWithProviders } from './render';

const lecture: FixedEvent = {
  id: 'fe1', title: 'Algorithms lecture', kind: 'class', courseId: 'c1', weekday: 2, startTime: '10:00', endTime: '12:00',
  validFrom: '2026-09-01', validTo: '2099-12-20', active: true, bufferBefore: null, bufferAfter: 30,
};
const shift: FixedEvent = {
  ...lecture, id: 'fe2', title: 'Cafe shift', kind: 'work', courseId: null, weekday: 6, startTime: '13:00', endTime: '17:00', bufferAfter: null,
};
const oldClass: FixedEvent = { ...lecture, id: 'fe3', title: 'Old seminar', weekday: 4, validFrom: '2020-01-01', validTo: '2020-06-01' };

const course = { id: 'c1', name: 'Algorithms', color: '#3f51b5', weeklyGoalMinutes: 360, active: true, createdAt: '', updatedAt: '' };

function api(extra: Record<string, Handler> = {}) {
  return mockApi({
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/preferences': () => DEFAULT_PREFERENCES,
    'GET /api/courses': () => [course],
    'GET /api/schedule': () => [lecture, shift, oldClass],
    ...extra,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Classes page', () => {
  test('shows every current fixed event in the week grid with its buffers and the weekly hours', async () => {
    const user = userEvent.setup();
    api();
    renderWithProviders(<ClassesPage />);
    const grid = await screen.findByRole('region', { name: 'Weekly class schedule' });
    const tuesday = within(grid).getByRole('group', { name: 'Tuesday' });
    const block = within(tuesday).getByRole('button', { name: 'Algorithms lecture, Tuesday 10:00–12:00' });
    expect(block).toHaveStyle({ '--ev': '#3f51b5' });
    // Default 15 min before, own 30 min after.
    expect(tuesday.querySelector('[title="15 min free before"]')).not.toBeNull();
    expect(tuesday.querySelector('[title="30 min free after"]')).not.toBeNull();
    expect(within(grid).getByRole('button', { name: 'Cafe shift, Saturday 13:00–17:00' })).toHaveStyle({ '--ev': '#616161' });
    // Ended semesters are hidden until asked for.
    expect(within(grid).queryByRole('button', { name: /Old seminar/ })).toBeNull();
    expect(screen.getByText(/of class per week/)).toHaveTextContent('2.0 h of class per week · 4.0 h of work');
    await user.click(screen.getByRole('button', { name: 'Show ended (1)' }));
    expect(within(grid).getByRole('button', { name: 'Old seminar, Thursday 10:00–12:00' })).toBeInTheDocument();
  });

  test('adds a class on several days with its own buffers', async () => {
    const user = userEvent.setup();
    const { calls } = api({ 'POST /api/schedule': (b) => ({ id: `new${b.weekday}`, ...b }) });
    renderWithProviders(<ClassesPage />);
    await user.click(await screen.findByRole('button', { name: 'Add class or shift' }));
    const dialog = screen.getByRole('dialog', { name: 'Add class' });
    await user.selectOptions(within(dialog).getByLabelText('Course'), 'Algorithms');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Algorithms');
    await user.click(within(dialog).getByRole('button', { name: 'Days: Monday' }));
    await user.click(within(dialog).getByRole('button', { name: 'Days: Wednesday' }));
    await user.click(within(dialog).getByRole('button', { name: 'Days: Friday' }));
    fireEvent.change(within(dialog).getByLabelText('Start'), { target: { value: '13:30' } });
    fireEvent.change(within(dialog).getByLabelText('End'), { target: { value: '15:00' } });
    expect(within(dialog).getByLabelText('Buffer before (min)')).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Use default after' }));
    const after = within(dialog).getByLabelText('Buffer after (min)');
    await user.clear(after);
    await user.type(after, '45');
    await user.click(within(dialog).getByRole('button', { name: 'Add to schedule' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((p) => (p.body as { weekday: number }).weekday)).toEqual([3, 5]);
    expect(posts[0]!.body).toMatchObject({
      kind: 'class', title: 'Algorithms', courseId: 'c1', startTime: '13:30', endTime: '15:00', active: true,
      bufferBefore: null, bufferAfter: 45,
    });
  });

  test('validates buffers and course before saving', async () => {
    const user = userEvent.setup();
    const { calls } = api();
    renderWithProviders(<ClassesPage />);
    await user.click(await screen.findByRole('button', { name: 'Add class or shift' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Use default before' }));
    const before = within(dialog).getByLabelText('Buffer before (min)');
    await user.clear(before);
    await user.type(before, '500');
    await user.click(within(dialog).getByRole('button', { name: 'Add to schedule' }));
    expect(await within(dialog).findByText('Course is required for classes')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter 0 to 240 minutes')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  test('offers an inline new course when there are none yet', async () => {
    const user = userEvent.setup();
    const created = { ...course, id: 'c9', name: 'Databases', color: '#00aa55', weeklyGoalMinutes: 0 };
    let list: unknown[] = [];
    const { calls } = api({
      'GET /api/courses': () => list,
      'POST /api/courses': () => {
        list = [created];
        return created;
      },
      'GET /api/schedule': () => [],
      'POST /api/schedule': (b) => ({ id: 'n1', ...b }),
    });
    renderWithProviders(<ClassesPage />);
    expect(await screen.findByText(/No classes or shifts yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add class or shift' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('New course name'), 'Databases');
    fireEvent.change(within(dialog).getByLabelText('New course colour'), { target: { value: '#00aa55' } });
    await user.type(within(dialog).getByLabelText('Study hours per week (outside class)'), '3.5');
    await user.click(within(dialog).getByRole('button', { name: 'Create course' }));
    await waitFor(() => expect(within(dialog).getByLabelText('Course')).toHaveValue('c9'));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/courses')?.body).toEqual({ name: 'Databases', color: '#00aa55', weeklyGoalMinutes: 210 });
    await user.click(within(dialog).getByRole('button', { name: 'Add to schedule' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/schedule' && c.method === 'POST')?.body).toMatchObject({ courseId: 'c9', title: 'Databases', weekday: 1 }));
  });

  test('clicking a block edits it; clearing its own buffer sends null', async () => {
    const user = userEvent.setup();
    const { calls } = api({ 'PATCH /api/schedule/fe1': (b) => ({ ...lecture, ...b }) });
    renderWithProviders(<ClassesPage />);
    await user.click(await screen.findByRole('button', { name: 'Algorithms lecture, Tuesday 10:00–12:00' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit class' });
    expect(within(dialog).getByLabelText('Buffer after (min)')).toHaveValue(30);
    expect(within(dialog).getByRole('checkbox', { name: 'Use default after' })).not.toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Use default after' }));
    await user.selectOptions(within(dialog).getByLabelText('Weekday'), 'Thursday');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ weekday: 4, bufferBefore: null, bufferAfter: null });
  });

  test('deletes from the edit form after confirming', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = api({ 'DELETE /api/schedule/fe1': () => ({ status: 204, body: null }) });
    renderWithProviders(<ClassesPage />);
    await user.click(await screen.findByRole('button', { name: 'Algorithms lecture, Tuesday 10:00–12:00' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalledWith('Remove all future occurrences of Algorithms lecture? Past, reviewed ones are kept.');
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/schedule/fe1')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('saves the default class buffer with a PATCH of only classBuffer', async () => {
    const user = userEvent.setup();
    const { calls } = api({ 'PATCH /api/preferences': (b) => ({ ...DEFAULT_PREFERENCES, ...b }) });
    renderWithProviders(<ClassesPage />);
    const after = await screen.findByLabelText('Class buffer after (min)');
    await user.clear(after);
    await user.type(after, '30');
    await user.click(screen.getByRole('button', { name: 'Save default buffer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/api/preferences', body: { classBuffer: { before: 15, after: 30 } } });
    expect(Object.keys(calls.find((c) => c.method === 'PATCH')!.body as object)).toEqual(['classBuffer']);
  });

  test('shows server field errors for the default buffer', async () => {
    const user = userEvent.setup();
    api({
      'PATCH /api/preferences': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { 'classBuffer.before': 'Too big' } } },
      }),
    });
    renderWithProviders(<ClassesPage />);
    await user.click(await screen.findByRole('button', { name: 'Save default buffer' }));
    expect(await screen.findByText('Too big')).toBeInTheDocument();
  });

  test('default semester dates use the configured timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T11:00:00Z')); // 2026-10-13 01:00 in Kiritimati
    try {
      api({ 'GET /api/settings': () => ({ timezone: 'Pacific/Kiritimati' }) });
      renderWithProviders(<ClassesPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Add class or shift' }));
      expect(screen.getByLabelText('Valid from')).toHaveValue('2026-10-13');
      expect(screen.getByLabelText('Valid to')).toHaveValue('2027-02-10');
    } finally {
      vi.useRealTimers();
    }
  });

  test('lists the week per day on narrow screens', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    api();
    renderWithProviders(<ClassesPage />);
    const tuesday = await screen.findByRole('region', { name: 'Tuesday' });
    expect(within(tuesday).getByRole('button', { name: 'Algorithms lecture, Tuesday 10:00–12:00' })).toHaveTextContent('Free 15 min before · 30 min after');
    expect(screen.queryByRole('region', { name: 'Weekly class schedule' })).toBeNull();
  });

  test('an archived course still colours its class but cannot be picked for new ones', async () => {
    const user = userEvent.setup();
    const archived = { ...course, id: 'c2', name: 'Old physics', color: '#aa3300', active: false };
    const physics: FixedEvent = { ...lecture, id: 'fe4', title: 'Physics lab', courseId: 'c2', weekday: 3 };
    api({ 'GET /api/courses': () => [course, archived], 'GET /api/schedule': () => [physics] });
    renderWithProviders(<ClassesPage />);
    const grid = await screen.findByRole('region', { name: 'Weekly class schedule' });
    expect(within(grid).getByRole('button', { name: 'Physics lab, Wednesday 10:00–12:00' })).toHaveStyle({ '--ev': '#aa3300' });
    await user.click(screen.getByRole('button', { name: 'Add class or shift' }));
    const options = within(within(screen.getByRole('dialog')).getByLabelText('Course')).getAllByRole('option').map((o) => o.textContent);
    expect(options).not.toContain('Old physics');
    expect(options).toContain('Algorithms');
  });
});

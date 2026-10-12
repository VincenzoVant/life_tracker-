import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { SettingsPage } from '../src/features/settings/SettingsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const event = {
  id: 'fe1',
  title: 'Algorithms lecture',
  kind: 'class',
  courseId: 'c1',
  weekday: 2,
  startTime: '10:00',
  endTime: '12:00',
  validFrom: '2026-09-01',
  validTo: '2026-12-20',
  active: true,
};

const base = {
  'GET /api/goals': () => ({
    startupMinutes: null, workoutsTotal: null, workoutsByType: { gym: null, cardio: null, sport: null },
    freeEvenings: null, dailyKcal: null, dailyProteinG: null,
  }),
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/google/status': () => ({ configured: false, connected: false }),
  'GET /api/courses': () => [{ id: 'c1', name: 'Algorithms' }],
  'GET /api/backups': () => ({ dir: '/b', files: [], lastBackupAt: null, lastError: null }),
  'GET /api/preferences': () => DEFAULT_PREFERENCES,
};

afterEach(() => vi.restoreAllMocks());

describe('Fixed schedule settings', () => {
  test('add class requires course; posts weekday and times', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ ...base, 'GET /api/schedule': () => [], 'POST /api/schedule': (b) => ({ id: 'new', ...b }) });
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('Title'), 'Databases');
    await user.selectOptions(screen.getByLabelText('Weekday'), 'Wednesday');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '13:30' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add to schedule' }));
    expect(await screen.findByText('Course is required for classes')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.selectOptions(screen.getByLabelText('Course'), 'Algorithms');
    await user.click(screen.getByRole('button', { name: 'Add to schedule' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeDefined());
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      kind: 'class', title: 'Databases', courseId: 'c1', weekday: 3, startTime: '13:30', endTime: '15:00', active: true,
    });
  });

  test('delete fixed event confirms with future-occurrence wording', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = mockApi({ ...base, 'GET /api/schedule': () => [event], 'DELETE /api/schedule/fe1': () => ({ status: 204, body: null }) });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Delete Algorithms lecture' }));
    expect(confirm).toHaveBeenCalledWith('Remove all future occurrences of Algorithms lecture? Past, reviewed ones are kept.');
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/schedule/fe1')).toBe(true));
  });

  test('default valid-from date uses the configured timezone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T11:00:00Z')); // 2026-10-13 01:00 in Kiritimati
    try {
      mockApi({ ...base, 'GET /api/settings': () => ({ timezone: 'Pacific/Kiritimati' }), 'GET /api/schedule': () => [] });
      renderWithProviders(<SettingsPage />);
      await waitFor(() => expect(screen.getByLabelText('Valid from')).toHaveValue('2026-10-13'));
    } finally {
      vi.useRealTimers();
    }
  });
});

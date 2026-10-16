import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { SettingsPage } from '../src/features/settings/SettingsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const goals = {
  startupMinutes: 600,
  workoutsTotal: 4,
  workoutsByType: { gym: 2, cardio: null, sport: null },
  freeEvenings: 2,
  dailyKcal: { target: 2200, tolerancePct: 10 },
  dailyProteinG: 120,
};

const base = {
  'GET /api/goals': () => goals,
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/google/status': () => ({ configured: false, connected: false }),
  'GET /api/schedule': () => [],
  'GET /api/courses': () => [],
  'GET /api/backups': () => ({ dir: '/b', files: [], lastBackupAt: null, lastError: null }),
  'GET /api/preferences': () => DEFAULT_PREFERENCES,
};

describe('SettingsPage', () => {
  test('planning section links to every planning area; old sections are gone', async () => {
    mockApi(base);
    renderWithProviders(<SettingsPage />);
    const planning = await screen.findByRole('region', { name: 'Planning' });
    const hrefs = within(planning).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/areas/this-week', '/areas/classes', '/areas/studies', '/areas/workouts', '/areas/meals', '/areas/startup']);
    expect(screen.queryByRole('heading', { name: 'Goals' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Fixed schedule' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Planner preferences' })).toBeNull();
  });

  test('timezone save calls PUT /api/settings', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ ...base, 'PUT /api/settings': (b) => b });
    renderWithProviders(<SettingsPage />);
    const select = await screen.findByRole('combobox', { name: 'Timezone' });
    await user.selectOptions(select, 'Europe/Brussels');
    await user.click(screen.getByRole('button', { name: 'Save timezone' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ timezone: 'Europe/Brussels' }));
  });

  test('change pin mismatched confirmation blocks submit', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ ...base, 'POST /api/auth/change-pin': () => ({}) });
    renderWithProviders(<SettingsPage />);
    await user.type(await screen.findByLabelText('Current PIN'), '1234');
    await user.type(screen.getByLabelText('New PIN'), '5678');
    await user.type(screen.getByLabelText('Confirm new PIN'), '5679');
    await user.click(screen.getByRole('button', { name: 'Change PIN' }));
    expect(await screen.findByText("PINs don't match")).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/auth/change-pin')).toBe(false);

    await user.clear(screen.getByLabelText('Confirm new PIN'));
    await user.type(screen.getByLabelText('Confirm new PIN'), '5678');
    await user.click(screen.getByRole('button', { name: 'Change PIN' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/auth/change-pin')?.body).toEqual({ currentPin: '1234', newPin: '5678' }));
  });
});

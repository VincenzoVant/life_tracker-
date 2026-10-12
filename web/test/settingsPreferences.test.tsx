import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { SettingsPage } from '../src/features/settings/SettingsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const base = {
  'GET /api/goals': () => ({
    startupMinutes: null, workoutsTotal: null, workoutsByType: { gym: null, cardio: null, sport: null },
    freeEvenings: null, dailyKcal: null, dailyProteinG: null,
  }),
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/courses': () => [],
  'GET /api/backups': () => ({ dir: '/b', files: [], lastBackupAt: null, lastError: null }),
  'GET /api/schedule': () => [],
};

afterEach(() => vi.restoreAllMocks());

describe('Planner preferences settings', () => {
  test('preferences save sends full object; server field error displayed at latestBlockEnd', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...base,
      'GET /api/preferences': () => DEFAULT_PREFERENCES,
      'PUT /api/preferences': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid preferences', fields: { latestBlockEnd: 'Preferences leave less than an hour per day' } } },
      }),
    });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByLabelText('Classes count toward study'));
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeDefined());
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ ...DEFAULT_PREFERENCES, classesCountTowardStudy: true });
    expect(await screen.findByText('Preferences leave less than an hour per day')).toBeInTheDocument();
    expect(screen.getByLabelText('Latest block end')).toHaveAttribute('aria-invalid', 'true');
  });

  test('reset to defaults sends {}', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = mockApi({ ...base, 'GET /api/preferences': () => DEFAULT_PREFERENCES, 'PUT /api/preferences': () => DEFAULT_PREFERENCES });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Reset to defaults' }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({}));
  });

  test('field errors without a rendered field are shown on day chips and in a fallback list', async () => {
    const user = userEvent.setup();
    mockApi({
      ...base,
      'GET /api/preferences': () => DEFAULT_PREFERENCES,
      'PUT /api/preferences': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid preferences', fields: { 'studyBlock.min': 'Min too small', studyBlock: 'Study block is inconsistent', allowedWorkoutDays: 'Pick at least one day' } } },
      }),
    });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByText('Min too small')).toBeInTheDocument();
    expect(screen.getByText('Pick at least one day')).toBeInTheDocument();
    expect(screen.getByText(/Study block is inconsistent/)).toBeInTheDocument();
    expect(screen.getAllByText(/Min too small/)).toHaveLength(1);
    expect(screen.getAllByText(/Pick at least one day/)).toHaveLength(1);
  });

  test('clearing a numeric input does not silently send 0', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ ...base, 'GET /api/preferences': () => DEFAULT_PREFERENCES, 'PUT /api/preferences': () => DEFAULT_PREFERENCES });
    renderWithProviders(<SettingsPage />);
    const input = await screen.findByLabelText('Buffer between blocks (min)');
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeDefined());
    expect((calls.find((c) => c.method === 'PUT')?.body as { bufferMinutes: unknown }).bufferMinutes).toBeNull();
  });
});

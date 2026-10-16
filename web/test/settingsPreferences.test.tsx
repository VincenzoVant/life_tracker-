import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { SettingsPage } from '../src/features/settings/SettingsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const base = {
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/google/status': () => ({ configured: false, connected: false }),
  'GET /api/backups': () => ({ dir: '/b', files: [], lastBackupAt: null, lastError: null }),
  'GET /api/preferences': () => DEFAULT_PREFERENCES,
};

afterEach(() => vi.restoreAllMocks());

describe('Day and evenings settings', () => {
  test('save PATCHes only the day keys; server field error is shown at its field', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...base,
      'PATCH /api/preferences': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid preferences', fields: { latestBlockEnd: 'Preferences leave less than an hour per day' } } },
      }),
    });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Protected evenings: Friday' }));
    await user.click(screen.getByRole('button', { name: 'Save day settings' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
    const d = DEFAULT_PREFERENCES;
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      sleep: d.sleep, earliestBlock: d.earliestBlock, latestBlockEnd: d.latestBlockEnd, bufferMinutes: d.bufferMinutes,
      maxPlannedMinutesPerDay: d.maxPlannedMinutesPerDay, eveningStart: d.eveningStart, protectedEvenings: [5],
      reviewPromptTime: d.reviewPromptTime,
    });
    expect(await screen.findByText('Preferences leave less than an hour per day')).toBeInTheDocument();
    expect(screen.getByLabelText('Latest block end')).toHaveAttribute('aria-invalid', 'true');
  });

  test('reset to defaults confirms and PUTs {}', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = mockApi({ ...base, 'PUT /api/preferences': () => DEFAULT_PREFERENCES });
    renderWithProviders(<SettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Reset to defaults' }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({}));
  });

  test('a cleared number field is sent as null and errors for other keys show in a fallback list', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...base,
      'PATCH /api/preferences': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid preferences', fields: { bufferMinutes: 'Expected number', studyBlock: 'Study block is inconsistent' } } },
      }),
    });
    renderWithProviders(<SettingsPage />);
    await user.clear(await screen.findByLabelText('Minimum gap between blocks (min)'));
    await user.click(screen.getByRole('button', { name: 'Save day settings' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toBeDefined());
    expect((calls.find((c) => c.method === 'PATCH')?.body as { bufferMinutes: unknown }).bufferMinutes).toBeNull();
    expect(await screen.findByText('Expected number')).toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'Other problems' })).toHaveTextContent('studyBlock: Study block is inconsistent');
  });
});

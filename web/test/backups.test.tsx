import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { BackupsSection } from '../src/features/settings/BackupsSection';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const status = (over = {}) => ({
  dir: '/Users/me/backups',
  files: [{ name: 'data-2026-10-12.db', size: 2048, modifiedAt: '2026-10-12T01:00:00.000Z' }],
  lastBackupAt: '2026-10-12T01:00:00.000Z',
  lastError: null,
  ...over,
});

describe('BackupsSection', () => {
  test('shows last error and back up now posts', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/backups': () => status({ lastError: 'EACCES: permission denied' }),
      'POST /api/backups/run': () => status(),
    });
    renderWithProviders(<BackupsSection />);
    expect(await screen.findByText('EACCES: permission denied')).toBeInTheDocument();
    expect(screen.getByText('data-2026-10-12.db')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/backups/run')).toBe(true));
  });

  test('invalid backup dir shows field error', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/backups': () => status(),
      'PUT /api/backups/settings': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { dir: 'Must be an absolute path or start with ~/' } } },
      }),
    });
    renderWithProviders(<BackupsSection />);
    await user.type(await screen.findByLabelText('Backup folder'), 'relative/dir');
    await user.click(screen.getByRole('button', { name: 'Save folder' }));
    expect(await screen.findByText('Must be an absolute path or start with ~/')).toBeInTheDocument();
    expect(screen.getByLabelText('Backup folder')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ dir: 'relative/dir' });
  });
});

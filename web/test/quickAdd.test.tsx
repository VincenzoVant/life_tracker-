import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QuickAddPage } from '../src/features/quickAdd/QuickAddPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const draft = {
  plan: { id: 'p1', weekStart: '2026-10-12', mode: 'replan', triggerBlockId: 'b1', status: 'draft', createdAt: '', summary: { shortfalls: [], reservedEvenings: [] } },
  changes: [],
  shortfalls: [],
};

function page() {
  return renderWithProviders(
    <Routes>
      <Route path="/quick-add" element={<QuickAddPage />} />
      <Route path="/replan/:planId" element={<p>replan page</p>} />
      <Route path="/" element={<p>today page</p>} />
    </Routes>,
    { route: '/quick-add' },
  );
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T23:00:00Z') })); // Wed 16:00 PDT
afterEach(() => vi.useRealTimers());

const settings = { 'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }) };

describe('QuickAddPage', () => {
  test('quick-add defaults: Social category, Rest of tonight after 15:00', async () => {
    mockApi(settings);
    page();
    expect(await screen.findByRole('button', { name: 'Rest of tonight' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Social' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'This afternoon' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('save with draft navigates to the replan page', async () => {
    const { calls } = mockApi({ ...settings, 'POST /api/quick-add': () => ({ status: 201, body: { block: { id: 'b1' }, draft } }) });
    page();
    await userEvent.type(await screen.findByLabelText('What'), 'Drinks');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('replan page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/quick-add')!.body).toEqual({
      title: 'Drinks', category: 'social', when: { preset: 'rest_of_tonight' },
    });
  });

  test('save with draft null shows "Added — nothing else needed to move"', async () => {
    mockApi({ ...settings, 'POST /api/quick-add': () => ({ status: 201, body: { block: { id: 'b1' }, draft: null } }) });
    page();
    await userEvent.type(await screen.findByLabelText('What'), 'Drinks');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('today page')).toBeInTheDocument();
    expect(screen.getByText('Added — nothing else needed to move')).toBeInTheDocument();
  });

  test('past-bedtime error shown under When', async () => {
    mockApi({
      ...settings,
      'POST /api/quick-add': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { when: "It's already past your bedtime" } } },
      }),
    });
    page();
    await userEvent.type(await screen.findByLabelText('What'), 'Late');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("It's already past your bedtime");
    expect(screen.queryByText('replan page')).not.toBeInTheDocument();
  });

  test('Pick a time sends start and duration in the configured timezone', async () => {
    const { calls } = mockApi({ ...settings, 'POST /api/quick-add': () => ({ status: 201, body: { block: { id: 'b1' }, draft: null } }) });
    page();
    await userEvent.type(await screen.findByLabelText('What'), 'Dinner');
    await userEvent.click(screen.getByRole('button', { name: 'Pick a time' }));
    await userEvent.click(screen.getByRole('button', { name: '2 h' }));
    const time = screen.getByLabelText('Start time');
    await userEvent.clear(time);
    await userEvent.type(time, '19:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/quick-add')).toBe(true));
    expect(calls.find((c) => c.path === '/api/quick-add')!.body).toMatchObject({
      when: { start: '2026-10-15T02:00:00.000Z', durationMinutes: 120 },
    });
  });
});

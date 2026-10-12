import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES, type Block, type Conflict, type GoogleChange, type GoogleStatus } from '@life-tracker/shared';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Banners } from '../src/components/Banners';
import { SyncBadge } from '../src/components/SyncBadge';
import { ChangesFeed } from '../src/features/today/ChangesFeed';
import { GoogleSection } from '../src/features/settings/GoogleSection';
import { WeekPage } from '../src/features/week/WeekPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

function block(over: Partial<Block>): Block {
  return {
    id: 'b', category: 'study', title: 'Study — Econometrics', start: '2026-10-21T02:00:00.000Z', end: '2026-10-21T04:00:00.000Z',
    status: 'committed', actualMinutes: null, source: 'manual', locked: false, courseId: null, startupTaskId: null,
    workoutType: null, mealSlot: null, fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null,
    gcalSyncedAt: null, notes: null, createdAt: '', updatedAt: '', ...over,
  };
}

const status = (over: Partial<GoogleStatus> = {}): GoogleStatus => ({
  configured: true, connected: true, needsReconnect: false, calendarId: 'cal', calendarMissing: false,
  busyCalendarIds: ['primary'], includeAllDay: false, lastSyncAt: '2026-10-14T18:55:00.000Z', lastError: null,
  pending: 0, failing: 0, ...over,
});

const conflict: Conflict = {
  id: 7, calendarId: 'primary', externalEventId: 'e1', title: 'Dentist',
  start: '2026-10-21T02:00:00.000Z', end: '2026-10-21T05:00:00.000Z', status: 'open', blocks: [block({})],
};

const settings = { 'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('SyncBadge', () => {
  test('sync badge shows pending count and hides at 0', async () => {
    let current = status({ pending: 3 });
    mockApi({ 'GET /api/google/status': () => current });
    const { queryClient } = renderWithProviders(<SyncBadge />);
    expect(await screen.findByText('3 changes waiting to sync')).toBeInTheDocument();
    current = status({ pending: 0 });
    await queryClient.invalidateQueries({ queryKey: ['google'] });
    await waitFor(() => expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument());
    expect(screen.queryByText('Sync error')).not.toBeInTheDocument();
  });

  test('failing items show a red Sync error link to settings', async () => {
    mockApi({ 'GET /api/google/status': () => status({ pending: 2, failing: 1 }) });
    renderWithProviders(<SyncBadge />);
    const link = await screen.findByRole('link', { name: 'Sync error' });
    expect(link).toHaveAttribute('href', '/settings#settings-google');
  });
});

function onHost(hostname: string) {
  vi.stubGlobal('location', { ...window.location, hostname });
}

describe('Reconnect and Connect on a non-loopback host (the phone)', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('Banners shows the Mac hint as text instead of a link', async () => {
    mockApi({ ...settings, 'GET /api/google/status': () => status({ needsReconnect: true }), 'GET /api/conflicts': () => [] });
    onHost('mac.tail1234.ts.net');
    renderWithProviders(<Banners />);
    expect(await screen.findByText('Reconnect on your Mac (http://127.0.0.1:4280)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  test('GoogleSection shows the Mac hint for Connect and for Reconnect', async () => {
    onHost('mac.tail1234.ts.net');
    mockApi({ 'GET /api/google/status': () => status({ connected: false }) });
    const first = renderWithProviders(<GoogleSection />);
    expect(await screen.findByText('Connect on your Mac (http://127.0.0.1:4280)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect Google Calendar' })).not.toBeInTheDocument();
    first.unmount();

    mockApi({
      'GET /api/google/status': () => status({ needsReconnect: true }),
      'GET /api/sync/status': () => ({ pending: 0, failing: [], lastSyncAt: null, lastError: null }),
      'GET /api/google/calendars': () => [],
    });
    renderWithProviders(<GoogleSection />);
    expect(await screen.findByText('Google needs to be reconnected')).toBeInTheDocument();
    expect(screen.getByText('Reconnect on your Mac (http://127.0.0.1:4280)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  test.each(['127.0.0.1', 'localhost', '[::1]'])('links are shown on %s', async (host) => {
    onHost(host);
    mockApi({
      'GET /api/google/status': () => status({ needsReconnect: true }),
      'GET /api/sync/status': () => ({ pending: 0, failing: [], lastSyncAt: null, lastError: null }),
      'GET /api/google/calendars': () => [],
    });
    renderWithProviders(<GoogleSection />);
    expect(await screen.findByText('Google needs to be reconnected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '/api/google/connect');
  });
});

describe('Banners', () => {
  test('reconnect banner links to connect endpoint', async () => {
    mockApi({ ...settings, 'GET /api/google/status': () => status({ needsReconnect: true }), 'GET /api/conflicts': () => [] });
    renderWithProviders(<Banners />);
    expect(await screen.findByText('Google Calendar needs to be reconnected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '/api/google/connect');
  });

  test('calendar missing banner recreates the calendar', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/google/status': () => status({ calendarMissing: true }),
      'GET /api/conflicts': () => [],
      'POST /api/google/recreate-calendar': () => status(),
    });
    renderWithProviders(<Banners />);
    expect(await screen.findByText('The Life Tracker calendar was deleted in Google')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Recreate calendar/ }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/google/recreate-calendar')).toBe(true));
  });

  test('conflict banner dismiss posts and hides', async () => {
    const user = userEvent.setup();
    let open: Conflict[] = [conflict];
    const { calls } = mockApi({
      ...settings,
      'GET /api/google/status': () => status(),
      'GET /api/conflicts': () => open,
      'POST /api/conflicts/7/dismiss': () => {
        open = [];
        return { ...conflict, status: 'dismissed' };
      },
    });
    renderWithProviders(<Banners />);
    expect(await screen.findByText('Dentist (Tue 19:00–22:00) overlaps Study — Econometrics')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/Dentist/)).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/conflicts/7/dismiss')).toBe(true);
  });
});

describe('Replan around this', () => {
  const draft = { plan: { id: 'plan-1' }, changes: [], shortfalls: [] };

  test('Replan around this navigates to replan page', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...settings,
      'GET /api/google/status': () => status(),
      'GET /api/conflicts': () => [conflict],
      'POST /api/conflicts/7/replan': () => ({ status: 201, body: draft }),
    });
    renderWithProviders(
      <>
        <Banners />
        <Routes>
          <Route path="/replan/:planId" element={<h1>Replan page</h1>} />
          <Route path="*" element={null} />
        </Routes>
      </>,
    );
    await user.click(await screen.findByRole('button', { name: 'Replan around this' }));
    expect(await screen.findByRole('heading', { name: 'Replan page' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/conflicts/7/replan')).toBe(true);
  });

  test('no draft shows a toast and the conflict stays open', async () => {
    const user = userEvent.setup();
    mockApi({
      ...settings,
      'GET /api/google/status': () => status(),
      'GET /api/conflicts': () => [conflict],
      'POST /api/conflicts/7/replan': () => ({ draft: null }),
    });
    renderWithProviders(<Banners />);
    await user.click(await screen.findByRole('button', { name: 'Replan around this' }));
    expect(await screen.findByText('Nothing needs to move')).toBeInTheDocument();
    expect(screen.getByText(/Dentist \(Tue/)).toBeInTheDocument();
  });
});

describe('ChangesFeed', () => {
  test('changes feed shows moved item and marks seen', async () => {
    const user = userEvent.setup();
    let list: GoogleChange[] = [
      { id: 1, blockId: 'g', kind: 'moved', title: 'Gym', beforeStart: '', beforeEnd: '', afterStart: '2026-10-16T01:00:00.000Z', afterEnd: '2026-10-16T02:00:00.000Z', createdAt: '' },
      { id: 2, blockId: 'l', kind: 'deleted', title: 'Startup — Landing page', beforeStart: '', beforeEnd: '', afterStart: null, afterEnd: null, createdAt: '' },
    ];
    const { calls } = mockApi({
      ...settings,
      'GET /api/google/changes': () => list,
      'POST /api/google/changes/seen': () => {
        list = [];
        return { ok: true };
      },
    });
    renderWithProviders(<ChangesFeed />);
    expect(await screen.findByText('Moved in Google: Gym → Thu 18:00')).toBeInTheDocument();
    expect(screen.getByText('Deleted in Google: Startup — Landing page')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(screen.queryByText(/Moved in Google/)).not.toBeInTheDocument());
    expect(calls.find((c) => c.path === '/api/google/changes/seen')?.body).toEqual({ ids: [1, 2] });
  });
});

describe('GoogleSection', () => {
  test('settings: busy calendar checkboxes save selected ids and includeAllDay', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/google/status': () => status(),
      'GET /api/sync/status': () => ({ pending: 0, failing: [], lastSyncAt: null, lastError: null }),
      'GET /api/google/calendars': () => [
        { id: 'primary', summary: 'Main', primary: true, selected: true },
        { id: 'uni', summary: 'Uni', primary: false, selected: false },
      ],
      'PUT /api/google/busy-calendars': () => status(),
    });
    renderWithProviders(<GoogleSection />);
    const uni = await screen.findByRole('checkbox', { name: 'Uni' });
    expect(screen.getByRole('checkbox', { name: /Main/ })).toBeChecked();
    await user.click(uni);
    await user.click(screen.getByRole('checkbox', { name: 'Treat all-day events as busy' }));
    await user.click(screen.getByRole('button', { name: 'Save calendars' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ calendarIds: ['primary', 'uni'], includeAllDay: true }),
    );
  });

  test('settings: not configured shows setup instructions; connected shows Sync now', async () => {
    mockApi({ 'GET /api/google/status': () => status({ configured: false, connected: false }) });
    const first = renderWithProviders(<GoogleSection />);
    expect(await screen.findByText('docs/setup-google.md')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    first.unmount();

    mockApi({
      'GET /api/google/status': () => status(),
      'GET /api/sync/status': () => ({
        pending: 1,
        failing: [{ blockId: 'x', title: 'Gym', attempts: 2, lastError: 'boom', nextAttemptAt: '' }],
        lastSyncAt: null,
        lastError: null,
      }),
      'GET /api/google/calendars': () => [],
    });
    renderWithProviders(<GoogleSection />);
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(await screen.findByText(/Gym: boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  test('configured but not connected offers Connect with the Mac hint', async () => {
    mockApi({ 'GET /api/google/status': () => status({ connected: false }) });
    renderWithProviders(<GoogleSection />);
    expect(await screen.findByRole('link', { name: 'Connect Google Calendar' })).toHaveAttribute('href', '/api/google/connect');
    expect(screen.getByText(/Do this on your Mac/)).toBeInTheDocument();
  });

  test('?google=connected shows a toast', async () => {
    mockApi({ 'GET /api/google/status': () => status({ connected: false }) });
    renderWithProviders(<GoogleSection />, { route: '/settings?google=connected' });
    expect(await screen.findByText('Google Calendar connected')).toBeInTheDocument();
  });
});

describe('Week deep link', () => {
  const week = (api: Record<string, () => unknown>) =>
    mockApi({
      ...settings,
      'GET /api/preferences': () => DEFAULT_PREFERENCES,
      'GET /api/blocks': () => [],
      'GET /api/plans/draft': () => null,
      'GET /api/meal-plan': () => [],
      ...api,
    });

  test("/week?block=<id> opens that block's week and details; unknown id shows toast", async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
    week({ 'GET /api/blocks/far': () => block({ id: 'far', title: 'Dentist prep', start: '2026-10-28T17:00:00.000Z', end: '2026-10-28T18:00:00.000Z' }) });
    const first = renderWithProviders(<WeekPage />, { route: '/week?block=far' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Dentist prep')).toBeInTheDocument();
    expect(screen.getByText('2026-10-26 – 2026-11-01')).toBeInTheDocument();
    first.unmount();

    week({ 'GET /api/blocks/ghost': () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Block not found' } } }) });
    renderWithProviders(<WeekPage />, { route: '/week?block=ghost' });
    expect(await screen.findByText('That block no longer exists')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { AuthGate } from '../src/features/auth/AuthGate';
import { Layout } from '../src/components/Layout';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

describe('AuthGate', () => {
  test('shows setup when no pin, requires matching confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/auth/status': () => ({ pinSet: false, authenticated: false }),
      'POST /api/auth/setup': () => ({ pinSet: true, authenticated: true }),
    });
    renderWithProviders(<AuthGate><p>secret</p></AuthGate>);

    await user.type(await screen.findByLabelText('PIN'), '1234');
    await user.type(screen.getByLabelText('Confirm PIN'), '1235');
    await user.click(screen.getByRole('button', { name: /set pin/i }));
    expect(await screen.findByText("PINs don't match")).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/auth/setup')).toBe(false);

    await user.clear(screen.getByLabelText('Confirm PIN'));
    await user.type(screen.getByLabelText('Confirm PIN'), '1234');
    await user.click(screen.getByRole('button', { name: /set pin/i }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/auth/setup')?.body).toEqual({ pin: '1234' }));
  });

  test('login error shows message; lockout shows 15 minute message', async () => {
    const user = userEvent.setup();
    let n = 0;
    mockApi({
      'GET /api/auth/status': () => ({ pinSet: true, authenticated: false }),
      'POST /api/auth/login': () =>
        ++n === 1
          ? { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Wrong PIN' } } }
          : { status: 429, body: { error: { code: 'LOCKED_OUT', message: 'locked' } } },
    });
    renderWithProviders(<AuthGate><p>secret</p></AuthGate>);

    await user.type(await screen.findByLabelText('PIN'), '0000');
    await user.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText('Wrong PIN')).toBeInTheDocument();

    await user.type(screen.getByLabelText('PIN'), '0000');
    await user.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText('Too many attempts — try again in 15 minutes')).toBeInTheDocument();
  });

  test('authenticated renders children', async () => {
    mockApi({ 'GET /api/auth/status': () => ({ pinSet: true, authenticated: true }) });
    renderWithProviders(<AuthGate><p>secret</p></AuthGate>);
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  test('a 401 from another route sends the user back to the PIN screen', async () => {
    const { apiFetch } = await import('../src/api/client');
    let authed = true;
    mockApi({
      'GET /api/auth/status': () => ({ pinSet: true, authenticated: authed }),
      'GET /api/things': () => {
        authed = false;
        return { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'no' } } };
      },
    });
    const { queryClient } = renderWithProviders(<AuthGate><p>secret</p></AuthGate>);
    await screen.findByText('secret');
    await apiFetch('/api/things').catch(() => undefined);
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
    expect(queryClient.getQueryState(['auth'])).toBeDefined();
  });
});

describe('AuthGate unreachable', () => {
  test('Retry button refetches auth status and recovers', async () => {
    const user = userEvent.setup();
    let up = false;
    mockApi({
      'GET /api/auth/status': () =>
        up ? { pinSet: true, authenticated: true } : { status: 503, body: { error: { code: 'INTERNAL', message: 'down' } } },
    });
    renderWithProviders(<AuthGate><p>secret</p></AuthGate>);
    expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
    up = true;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  test('refetches when the window regains focus', async () => {
    let up = false;
    mockApi({
      'GET /api/auth/status': () =>
        up ? { pinSet: true, authenticated: true } : { status: 503, body: { error: { code: 'INTERNAL', message: 'down' } } },
    });
    renderWithProviders(<AuthGate><p>secret</p></AuthGate>);
    await screen.findByText("Can't reach the server.");
    up = true;
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });
});

describe('Layout', () => {
  test('renders children with navigation including Today', async () => {
    renderWithProviders(<Layout><p>content</p></Layout>);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Today' }).length).toBeGreaterThan(0);
    for (const l of screen.getAllByRole('link', { name: 'Settings' })) expect(l).toHaveAttribute('href', '/settings');
  });
});

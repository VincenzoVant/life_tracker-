import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError, apiFetch, isNetworkError } from '../src/api/client';
import { useToast } from '../src/components/Toast';
import { renderWithProviders } from './render';

const OFFLINE = 'Life Tracker is offline — your Mac may be asleep or disconnected.';
let healthy = false;
let healthCalls = 0;

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (path === '/api/health') {
        healthCalls += 1;
        if (!healthy) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (path === '/api/auth/status') {
        return new Response(JSON.stringify({ pinSet: true, authenticated: false }), { status: 200 });
      }
      throw new TypeError('Failed to fetch');
    }),
  );
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  healthy = false;
  healthCalls = 0;
  stubFetch();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('offline screen', () => {
  test('two failed health checks show the offline screen with exact text', async () => {
    renderWithProviders(<App />);
    await flush();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
    await flush(30_000);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    expect(screen.getByText('Check that your Mac is awake and Tailscale is connected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('one failure does not show offline screen', async () => {
    renderWithProviders(<App />);
    await flush();
    expect(healthCalls).toBe(1);
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  test('window focus triggers a check and recovers to app when health succeeds', async () => {
    renderWithProviders(<App />);
    await flush();
    await flush(30_000);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    healthy = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  test('Retry button re-checks health', async () => {
    renderWithProviders(<App />);
    await flush();
    await flush(30_000);
    healthy = true;
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    await flush();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  test('network errors become ApiError status 0 and raise no toasts', async () => {
    const err = await apiFetch('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'INTERNAL' });

    expect(isNetworkError(err)).toBe(true);
    expect(isNetworkError(new ApiError(500, 'INTERNAL', 'Boom'))).toBe(false);
    expect(isNetworkError(new Error('x'))).toBe(false);

    function Trigger() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => void apiFetch('/api/x').catch((e) => toast.showError(e, 'Could not save'))}>go</button>
          <button onClick={() => toast.showError(new ApiError(500, 'INTERNAL', 'Server exploded'), 'Could not save')}>fail</button>
          <button onClick={() => toast.show('Network unreachable', 'error')}>plain</button>
        </>
      );
    }
    renderWithProviders(<Trigger />);
    await act(async () => {
      screen.getByRole('button', { name: 'go' }).click();
    });
    await flush();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    // A non-network error still toasts, and suppression is by flag, not message text.
    await act(async () => {
      screen.getByRole('button', { name: 'fail' }).click();
      screen.getByRole('button', { name: 'plain' }).click();
    });
    expect(screen.getByText('Server exploded')).toBeInTheDocument();
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
  });
});

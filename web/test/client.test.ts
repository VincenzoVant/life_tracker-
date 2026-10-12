import { describe, expect, test } from 'vitest';
import { apiFetch, ApiError } from '../src/api/client';
import { mockApi } from './mockApi';

describe('apiFetch', () => {
  test('throws ApiError with code and fields', async () => {
    mockApi({
      'POST /api/courses': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'bad', fields: { name: 'Required' } } },
      }),
    });
    const err = await apiFetch('/api/courses', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION', fields: { name: 'Required' } });
  });

  test('sends JSON body and returns parsed JSON', async () => {
    const { calls } = mockApi({ 'POST /api/x': (body) => ({ echoed: body }) });
    await expect(apiFetch('/api/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ echoed: { a: 1 } });
    expect(calls).toEqual([{ method: 'POST', path: '/api/x', body: { a: 1 } }]);
  });

  test('falls back to INTERNAL when the error body is not JSON', async () => {
    const err = await (async () => {
      const { vi } = await import('vitest');
      vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 502 })));
      return apiFetch('/api/x').catch((e) => e);
    })();
    expect(err).toMatchObject({ status: 502, code: 'INTERNAL' });
  });
});

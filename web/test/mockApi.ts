import { vi } from 'vitest';

export type MockResult = unknown | { status: number; body: unknown };
export type Handler = (body: any, url: URL) => MockResult;
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

const unmatched: string[] = [];

/** Returns and clears the unmatched calls recorded since the last drain. The global afterEach in setup.ts fails the test if any remain. */
export function takeUnmatchedCalls(): string[] {
  return unmatched.splice(0);
}

function isStatusResult(r: unknown): r is { status: number; body: unknown } {
  return typeof r === 'object' && r !== null && 'status' in r && 'body' in r && Object.keys(r).length === 2;
}

/** Stubs global fetch. Handlers are keyed "METHOD /api/path" (query string excluded). Unmatched calls throw. */
export function mockApi(handlers: Record<string, Handler>): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: url.pathname, body });
      const handler = handlers[`${method} ${url.pathname}`];
      if (!handler) {
        unmatched.push(`${method} ${url.pathname}`);
        throw new Error(`Unmocked API call: ${method} ${url.pathname}`);
      }
      const result = handler(body, url);
      const { status, payload } = isStatusResult(result) ? { status: result.status, payload: result.body } : { status: 200, payload: result };
      return new Response(status === 204 ? null : JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return { calls };
}

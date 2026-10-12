import type { Hono } from 'hono';
import { loadConfig } from '../src/config.js';
import { createCtx, type Ctx } from '../src/ctx.js';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { fixedClock } from '../src/lib/clock.js';
import { setSetting } from '../src/domains/settings/service.js';

export function createTestCtx(opts: { now?: string; timezone?: string } = {}): Ctx & { clock: ReturnType<typeof fixedClock> } {
  const handle = openDb(':memory:');
  runMigrations(handle, {});
  const clock = fixedClock(opts.now ?? '2026-10-14T19:00:00.000Z');
  const ctx = { ...createCtx(handle, loadConfig({ HOME: '/tmp/lt-test' } as NodeJS.ProcessEnv), clock), clock };
  setSetting(ctx, 'timezone', opts.timezone ?? 'America/Los_Angeles');
  return ctx;
}

export async function request(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const init: RequestInit = {
    method,
    headers: {
      Origin: 'http://127.0.0.1:4280',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await app.request(path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}

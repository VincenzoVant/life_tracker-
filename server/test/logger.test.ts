import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, expect, test } from 'vitest';
import pino from 'pino';
import { createApp } from '../src/app.js';
import { LOG_CURRENT_PATH_NAME, createLogger } from '../src/logger.js';
import { createTestCtx, request } from './helpers.js';

function capture(): { lines: () => any[]; log: pino.Logger } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { lines: () => chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)), log: pino(stream) };
}

test('request log line has method/path/status/ms but no query, body or cookie', async () => {
  const { lines, log } = capture();
  const app = createApp(createTestCtx(), { log });
  const setup = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
  const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
  await request(app, 'GET', '/api/blocks?from=2026-10-01T00:00:00.000Z&to=2026-10-08T00:00:00.000Z', undefined, { Cookie: cookie });
  const line = lines().find((l) => l.path === '/api/blocks');
  expect(line).toMatchObject({ method: 'GET', path: '/api/blocks', status: 200 });
  expect(typeof line.ms).toBe('number');
  const raw = JSON.stringify(lines());
  expect(raw).not.toContain('from=');
  expect(raw).not.toContain('lt_session');
  expect(raw).not.toContain('1234');
});

let fileLog: pino.Logger | undefined;
let tmpDirs: string[] = [];

afterEach(async () => {
  const log = fileLog;
  fileLog = undefined;
  if (log) {
    await new Promise<void>((r) => log.flush(() => r()));
    // Close the pino-roll worker transport so it releases the tmp dir.
    const stream = (log as any)[pino.symbols.streamSym] as { end?: () => void } | undefined;
    stream?.end?.();
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

test('file transport writes server.*.log and a current.log symlink', { timeout: 20_000 }, async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lt-log-'));
  tmpDirs.push(dataDir);
  const log = createLogger({ dataDir, toFile: true });
  fileLog = log;
  log.info('hello');
  const logs = join(dataDir, 'logs');
  const current = join(logs, LOG_CURRENT_PATH_NAME);
  const ready = (): boolean =>
    existsSync(logs) &&
    readdirSync(logs).some((f) => /^server\.\d+\.log$/.test(f)) &&
    existsSync(current) &&
    lstatSync(current).isSymbolicLink();
  // Poll with backoff (50ms growing to 500ms) for up to ~15s; the worker thread is slow to boot under parallel load.
  const deadline = Date.now() + 15_000;
  for (let delay = 50; Date.now() < deadline && !ready(); delay = Math.min(delay * 2, 500)) {
    await new Promise((r) => setTimeout(r, delay));
  }
  expect(ready()).toBe(true);
});

test('createLogger without file returns a usable logger', () => {
  const log = createLogger({ dataDir: '/nonexistent-lt-dir', toFile: false });
  expect(typeof log.info).toBe('function');
});

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

let fileLogs: pino.Logger[] = [];
let tmpDirs: string[] = [];

type Transport = { end?: () => void; on?: (ev: string, fn: (...a: any[]) => void) => unknown; once?: (ev: string, fn: () => void) => unknown };
const transportOf = (log: pino.Logger) => (log as any)[pino.symbols.streamSym] as Transport | undefined;

afterEach(async () => {
  const logs = fileLogs;
  fileLogs = [];
  for (const log of logs) {
    await new Promise<void>((r) => log.flush(() => r()));
    // Close the pino-roll worker transport and wait for it, so it releases the tmp dir before we delete it.
    const stream = transportOf(log);
    await new Promise<void>((r) => {
      const t = setTimeout(r, 2_000);
      stream?.once?.('close', () => {
        clearTimeout(t);
        r();
      });
      stream?.end?.();
      if (!stream?.once) r();
    });
  }
  await new Promise((r) => setTimeout(r, 100));
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

/** Starts a file logger in a fresh tmp dir and polls (with backoff) until its files appear or `budgetMs` elapses. */
async function startFileLogger(budgetMs: number): Promise<boolean> {
  const dataDir = mkdtempSync(join(tmpdir(), 'lt-log-'));
  tmpDirs.push(dataDir);
  const log = createLogger({ dataDir, toFile: true });
  fileLogs.push(log);
  // pino-roll can still be starting up when the dir is removed on teardown and then fails with ENOENT; that is expected noise here.
  transportOf(log)?.on?.('error', () => {});
  log.info('hello');
  const logs = join(dataDir, 'logs');
  const current = join(logs, LOG_CURRENT_PATH_NAME);
  const ready = (): boolean =>
    existsSync(logs) &&
    readdirSync(logs).some((f) => /^server\.\d+\.log$/.test(f)) &&
    existsSync(current) &&
    lstatSync(current).isSymbolicLink();
  const deadline = Date.now() + budgetMs;
  for (let delay = 50; Date.now() < deadline && !ready(); delay = Math.min(delay * 2, 500)) {
    await new Promise((r) => setTimeout(r, delay));
  }
  return ready();
}

// The pino-roll worker occasionally fails to come up when the whole monorepo suite runs in parallel;
// a fresh logger/worker recovers quickly, so retry the test rather than wait on a stuck one.
test('file transport writes server.*.log and a current.log symlink', { retry: 2, timeout: 60_000 }, async () => {
  expect(await startFileLogger(15_000)).toBe(true);
});

test('createLogger without file returns a usable logger', () => {
  const log = createLogger({ dataDir: '/nonexistent-lt-dir', toFile: false });
  expect(typeof log.info).toBe('function');
});

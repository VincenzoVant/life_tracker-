import { Writable } from 'node:stream';
import { expect, test } from 'vitest';
import pino from 'pino';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/logger.js';
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

test('createLogger without file returns a usable logger', () => {
  const log = createLogger({ dataDir: '/nonexistent-lt-dir', toFile: false });
  expect(typeof log.info).toBe('function');
});

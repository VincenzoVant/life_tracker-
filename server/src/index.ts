import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Logger } from 'pino';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createCtx } from './ctx.js';
import { openDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { runBackup } from './domains/backups/service.js';
import { getTimezone } from './domains/settings/service.js';
import { systemClock } from './lib/clock.js';
import { createScheduler } from './jobs/scheduler.js';
import { createLogger } from './logger.js';
import { mountStatic } from './static.js';

function flushThenExit(log: Logger, code: number): void {
  const timer = setTimeout(() => process.exit(code), 1000);
  log.flush(() => {
    clearTimeout(timer);
    process.exit(code);
  });
}

export async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const { dataDir } = config;
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, 'secrets'), { recursive: true, mode: 0o700 });
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  const log = createLogger({ dataDir, toFile: true });
  const backupDir = join(dataDir, 'backups');
  mkdirSync(backupDir, { recursive: true });

  const handle = openDb(join(dataDir, 'data.db'));
  runMigrations(handle, { backupDir });

  const ctx = createCtx(handle, config);
  const app = createApp(ctx, { log });
  const scheduler = createScheduler({ clock: systemClock, log: (msg, err) => log.error({ err }, msg) });
  scheduler.dailyAt('backup', '03:00', () => getTimezone(ctx), async () => {
    await runBackup(ctx);
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      scheduler.stop();
      process.exit(0);
    });
  }
  if (config.webDist) mountStatic(app, config.webDist);

  const fatal = (kind: string) => (err: unknown) => {
    log.fatal({ err }, kind);
    flushThenExit(log, 1);
  };
  process.on('uncaughtException', fatal('uncaughtException'));
  process.on('unhandledRejection', fatal('unhandledRejection'));
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      log.info({ sig }, 'shutting down');
      flushThenExit(log, 0);
    });
  }

  serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, () => {
    log.info({ port: config.port }, `Life Tracker listening on http://127.0.0.1:${config.port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

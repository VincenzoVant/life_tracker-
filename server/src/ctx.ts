import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { Db } from './db/client.js';
import type Database from 'better-sqlite3';
import { createBlockEventBus, type BlockEventBus } from './domains/blocks/events.js';
import { createGoogleIntegration, type GoogleIntegration } from './calendar/oauth.js';
import { registerSyncEnqueue } from './calendar/enqueue.js';
import { emptyBusyProvider, type BusyProvider } from './domains/plans/busy.js';
import { systemClock, type Clock } from './lib/clock.js';

export interface Ctx {
  db: Db;
  sqlite: Database.Database;
  clock: Clock;
  config: AppConfig;
  events: BlockEventBus;
  google: GoogleIntegration;
  busy: BusyProvider;
}

export function createCtx(handle: DbHandle, config: AppConfig, clock: Clock = systemClock): Ctx {
  const events = createBlockEventBus();
  const ctx: Ctx = { db: handle.db, sqlite: handle.sqlite, clock, config, events, google: createGoogleIntegration(config), busy: emptyBusyProvider };
  registerSyncEnqueue(ctx);
  return ctx;
}

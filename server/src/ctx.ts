import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { Db } from './db/client.js';
import type Database from 'better-sqlite3';
import { systemClock, type Clock } from './lib/clock.js';

/** Placeholder bus; Task 5 replaces this with the real BlockEventBus. */
export interface BlockEventBus {
  emit(): void;
  subscribe(): () => void;
}

export interface Ctx {
  db: Db;
  sqlite: Database.Database;
  clock: Clock;
  config: AppConfig;
  events: BlockEventBus;
}

export function createCtx(handle: DbHandle, config: AppConfig, clock: Clock = systemClock): Ctx {
  const events: BlockEventBus = { emit() {}, subscribe: () => () => {} };
  return { db: handle.db, sqlite: handle.sqlite, clock, config, events };
}

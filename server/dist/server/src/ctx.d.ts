import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { Db } from './db/client.js';
import type Database from 'better-sqlite3';
import { type BlockEventBus } from './domains/blocks/events.js';
import { type Clock } from './lib/clock.js';
export interface Ctx {
    db: Db;
    sqlite: Database.Database;
    clock: Clock;
    config: AppConfig;
    events: BlockEventBus;
}
export declare function createCtx(handle: DbHandle, config: AppConfig, clock?: Clock): Ctx;

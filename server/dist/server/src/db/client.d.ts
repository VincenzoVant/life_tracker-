import Database from 'better-sqlite3';
import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
export type Db = BetterSQLite3Database<typeof schema>;
export interface DbHandle {
    sqlite: Database.Database;
    db: Db;
}
export declare function openDb(file: string | ':memory:'): DbHandle;

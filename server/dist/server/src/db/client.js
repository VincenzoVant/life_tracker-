import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
export function openDb(file) {
    const sqlite = new Database(file);
    if (file !== ':memory:')
        sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    return { sqlite, db: drizzle(sqlite, { schema }) };
}

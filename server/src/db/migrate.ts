import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DbHandle } from './client.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

function journalCount(): number {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'));
  return journal.entries.length;
}

/** Number of applied migrations, or null when the database has never been migrated. */
function appliedCount(handle: DbHandle): number | null {
  const exists = handle.sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
    .get();
  if (!exists) return null;
  return (handle.sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
}

/**
 * Runs fn with foreign key enforcement off. The pragma is a no-op inside a transaction, so it must be
 * set before drizzle's migrator opens one; otherwise table rebuilds (DROP + RENAME) fire ON DELETE
 * actions on child rows. Enforcement is restored afterwards and the result is checked.
 */
export function withForeignKeysOff<T>(sqlite: DbHandle['sqlite'], fn: () => T): T {
  sqlite.pragma('foreign_keys = OFF');
  let result: T;
  try {
    result = fn();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  const violations = sqlite.pragma('foreign_key_check') as unknown[];
  if (violations.length > 0) {
    throw new Error(`Foreign key check failed after migration: ${JSON.stringify(violations.slice(0, 5))}`);
  }
  return result;
}

export function runMigrations(handle: DbHandle, opts: { backupDir?: string } = {}): { applied: number } {
  const before = appliedCount(handle);
  const applied = journalCount() - (before ?? 0);
  const isFile = handle.sqlite.name !== ':memory:' && handle.sqlite.name !== '';
  if (applied > 0 && before !== null && isFile && opts.backupDir) {
    mkdirSync(opts.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, '-');
    // better-sqlite3 backup is async; use VACUUM INTO for a synchronous consistent copy.
    handle.sqlite.exec(`VACUUM INTO '${join(opts.backupDir, `pre-migrate-${stamp}.db`).replace(/'/g, "''")}'`);
  }
  withForeignKeysOff(handle.sqlite, () => migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER }));
  return { applied };
}

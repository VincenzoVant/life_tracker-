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
  migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { applied };
}

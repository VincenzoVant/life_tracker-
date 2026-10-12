import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
function journalCount() {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'));
    return journal.entries.length;
}
/** Number of applied migrations, or null when the database has never been migrated. */
function appliedCount(handle) {
    const exists = handle.sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
        .get();
    if (!exists)
        return null;
    return handle.sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get().n;
}
/**
 * Runs fn with foreign key enforcement off. The pragma is a no-op inside a transaction, so it must be
 * set before drizzle's migrator opens one; otherwise table rebuilds (DROP + RENAME) fire ON DELETE
 * actions on child rows. Enforcement is restored afterwards and the result is checked.
 */
export function withForeignKeysOff(sqlite, fn, opts = {}) {
    sqlite.pragma('foreign_keys = OFF');
    let result;
    try {
        result = fn();
    }
    finally {
        sqlite.pragma('foreign_keys = ON');
    }
    if (opts.check === false)
        return result;
    const violations = sqlite.pragma('foreign_key_check');
    if (violations.length > 0) {
        const tables = [...new Set(violations.map((v) => v.table))].join(', ');
        const hint = opts.backupPath ? `; restore from ${opts.backupPath}` : '';
        throw new Error(`Foreign key check failed after migration (tables: ${tables})${hint}`);
    }
    return result;
}
export function runMigrations(handle, opts = {}) {
    const before = appliedCount(handle);
    const applied = journalCount() - (before ?? 0);
    const isFile = handle.sqlite.name !== ':memory:' && handle.sqlite.name !== '';
    let backupPath;
    if (applied > 0 && before !== null && isFile && opts.backupDir) {
        mkdirSync(opts.backupDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/:/g, '-');
        // better-sqlite3 backup is async; use VACUUM INTO for a synchronous consistent copy.
        backupPath = join(opts.backupDir, `pre-migrate-${stamp}.db`);
        handle.sqlite.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    }
    // Only check when something was applied, so a pre-existing violation cannot block every boot.
    withForeignKeysOff(handle.sqlite, () => migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER }), {
        check: applied > 0,
        ...(backupPath ? { backupPath } : {}),
    });
    return { applied };
}

import type { DbHandle } from './client.js';
/**
 * Runs fn with foreign key enforcement off. The pragma is a no-op inside a transaction, so it must be
 * set before drizzle's migrator opens one; otherwise table rebuilds (DROP + RENAME) fire ON DELETE
 * actions on child rows. Enforcement is restored afterwards and the result is checked.
 */
export declare function withForeignKeysOff<T>(sqlite: DbHandle['sqlite'], fn: () => T, opts?: {
    check?: boolean;
    backupPath?: string;
}): T;
export declare function runMigrations(handle: DbHandle, opts?: {
    backupDir?: string;
}): {
    applied: number;
};

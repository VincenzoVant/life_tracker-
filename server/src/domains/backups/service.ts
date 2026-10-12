import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { localDateOf, type BackupSettingsInput, type BackupStatus } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { AppError } from '../../lib/errors.js';
import { getSetting, getTimezone, setSetting } from '../settings/service.js';

const BACKUP_FILE = /^data-\d{4}-\d{2}-\d{2}\.db$/;
const KEEP = 14;

export function expandHome(dir: string): string {
  if (dir === '~') return homedir();
  return dir.startsWith('~/') ? join(homedir(), dir.slice(2)) : dir;
}

export function resolveBackupDir(ctx: Ctx): string {
  const configured = getSetting<string | null>(ctx, 'backupDir', null);
  return configured ? expandHome(configured) : join(ctx.config.dataDir, 'backups');
}

function listBackups(dir: string): BackupStatus['files'] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => BACKUP_FILE.test(n))
    .sort()
    .reverse()
    .map((name) => {
      const st = statSync(join(dir, name));
      return { name, size: st.size, modifiedAt: st.mtime.toISOString() };
    });
}

export async function runBackup(ctx: Ctx): Promise<{ file: string }> {
  try {
    const dir = resolveBackupDir(ctx);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `data-${localDateOf(ctx.clock.now(), getTimezone(ctx))}.db`);
    await ctx.sqlite.backup(file);
    for (const old of listBackups(dir).slice(KEEP)) unlinkSync(join(dir, old.name));
    setSetting(ctx, 'backup_last_at', ctx.clock.now().toISOString());
    setSetting(ctx, 'backup_last_error', null);
    return { file };
  } catch (err) {
    setSetting(ctx, 'backup_last_error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export function getBackupStatus(ctx: Ctx): BackupStatus {
  const dir = resolveBackupDir(ctx);
  return {
    dir,
    files: listBackups(dir),
    lastBackupAt: getSetting<string | null>(ctx, 'backup_last_at', null),
    lastError: getSetting<string | null>(ctx, 'backup_last_error', null),
  };
}

export function saveBackupSettings(ctx: Ctx, input: BackupSettingsInput): BackupStatus {
  const dir = expandHome(input.dir);
  if (!isAbsolute(dir)) throw new AppError('VALIDATION', 'Invalid input', { dir: 'Must be an absolute path' });
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.lt-write-test-${process.pid}`);
    writeFileSync(probe, '');
    unlinkSync(probe);
  } catch (err) {
    throw new AppError('VALIDATION', 'Backup folder is not writable', {
      dir: `Cannot write to this folder: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  setSetting(ctx, 'backupDir', input.dir);
  return getBackupStatus(ctx);
}

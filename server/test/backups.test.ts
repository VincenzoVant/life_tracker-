import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';
import { resolveBackupDir, runBackup, saveBackupSettings } from '../src/domains/backups/service.js';
import { setSetting } from '../src/domains/settings/service.js';
import { createTestClient, createTestCtx } from './helpers.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lt-backup-'));
});
afterEach(() => {
  for (const d of [tmp, join(tmp, 'ro')]) if (existsSync(d)) chmodSync(d, 0o700);
  rmSync(tmp, { recursive: true, force: true });
});

function ctxWith(dir: string, db = 'data.db') {
  const ctx = createTestCtx({ file: join(tmp, db), config: loadConfig({ HOME: tmp, LT_DATA_DIR: join(tmp, 'data') } as NodeJS.ProcessEnv) });
  setSetting(ctx, 'backupDir', dir);
  return ctx;
}

describe('backups', () => {
  test('backup of a WAL file db is openable and contains latest rows', async () => {
    const dir = join(tmp, 'out');
    const ctx = ctxWith(dir);
    expect(ctx.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    ctx.sqlite
      .prepare("INSERT INTO courses (id, name, color, weekly_goal_minutes, active, created_at, updated_at) VALUES ('c1','Algebra','#fff',60,1,'x','x')")
      .run();
    const { file } = await runBackup(ctx);
    expect(file).toBe(join(dir, 'data-2026-10-14.db'));
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare("SELECT name FROM courses WHERE id='c1'").get()).toEqual({ name: 'Algebra' });
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    copy.close();
  });

  test('same-day backup overwrites; keeps newest 14 data-*.db and never deletes pre-migrate-*.db or other files', async () => {
    const dir = join(tmp, 'out');
    mkdirSync(dir);
    for (let i = 1; i <= 20; i++) writeFileSync(join(dir, `data-2026-09-${String(i).padStart(2, '0')}.db`), 'old');
    writeFileSync(join(dir, 'pre-migrate-x.db'), 'keep');
    writeFileSync(join(dir, 'notes.txt'), 'keep');
    const ctx = ctxWith(dir);
    await runBackup(ctx);
    await runBackup(ctx); // same day overwrites
    const names = readdirSync(dir);
    const data = names.filter((n) => /^data-/.test(n)).sort();
    expect(data).toHaveLength(14);
    expect(data.at(-1)).toBe('data-2026-10-14.db');
    expect(data[0]).toBe('data-2026-09-08.db');
    expect(names).toContain('pre-migrate-x.db');
    expect(names).toContain('notes.txt');
  });

  test('missing folder is created; unwritable folder records lastError and status shows it', async () => {
    const created = join(tmp, 'a', 'b');
    await runBackup(ctxWith(created));
    expect(existsSync(join(created, 'data-2026-10-14.db'))).toBe(true);

    const ro = join(tmp, 'ro');
    mkdirSync(ro);
    chmodSync(ro, 0o500);
    const client = await createTestClient(ctxWith(join(ro, 'sub'), 'ro.db'));
    const run = await client.post('/api/backups/run');
    expect(run.status).toBe(500);
    expect(run.body.error.message).toBeTruthy();
    const status = await client.get('/api/backups');
    expect(status.body.lastError).toBeTruthy();
    expect(status.body.lastBackupAt).toBeNull();
    expect((await client.get('/api/health')).status).toBe(200);
  });

  test('~/ in dir expands to home', () => {
    const ctx = ctxWith('~/Backups/lt');
    expect(resolveBackupDir(ctx)).toBe(join(homedir(), 'Backups/lt'));
  });

  test('saveBackupSettings rejects unwritable dir with fields.dir', async () => {
    const ro = join(tmp, 'ro');
    mkdirSync(ro);
    chmodSync(ro, 0o500);
    const client = await createTestClient(ctxWith(join(tmp, 'out')));
    const res = await client.put('/api/backups/settings', { dir: join(ro, 'sub') });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.dir).toBeTruthy();
    expect(() => saveBackupSettings(client.ctx, { dir: join(ro, 'sub') })).toThrow();
    const ok = await client.put('/api/backups/settings', { dir: join(tmp, 'good') });
    expect(ok.status).toBe(200);
    expect(ok.body.dir).toBe(join(tmp, 'good'));
  });
});

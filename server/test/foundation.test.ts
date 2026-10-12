import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { createTestClient, createTestCtx, request } from './helpers.js';

test('health returns ok', async () => {
  const ctx = createTestCtx();
  const res = await request(createApp(ctx), 'GET', '/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, time: '2026-10-14T19:00:00.000Z' });
});

test('unknown api route returns NOT_FOUND error shape', async () => {
  const res = await (await createTestClient()).get('/api/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
});

test('settings timezone round-trips and rejects invalid zones', async () => {
  const client = await createTestClient();
  expect((await client.put('/api/settings', { timezone: 'Europe/Brussels' })).status).toBe(200);
  expect((await client.get('/api/settings')).body).toEqual({ timezone: 'Europe/Brussels' });
  const bad = await client.put('/api/settings', { timezone: 'Mars/Base' });
  expect(bad.status).toBe(400);
  expect(bad.body.error.fields.timezone).toBeDefined();
});

test('runMigrations backs up an existing file db before applying pending migrations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-mig-'));
  const backupDir = join(dir, 'backups');
  const file = join(dir, 'data.db');
  const backups = () => (existsSync(backupDir) ? readdirSync(backupDir).filter((f) => /^pre-migrate-.*\.db$/.test(f)) : []);

  const first = openDb(file);
  expect(runMigrations(first, { backupDir }).applied).toBeGreaterThan(0);
  expect(backups()).toHaveLength(0); // brand-new db: nothing to back up
  first.sqlite.close();

  const second = openDb(file);
  expect(runMigrations(second, { backupDir }).applied).toBe(0);
  expect(backups()).toHaveLength(0); // nothing pending

  // Simulate pending migrations without naming any table: drop every user table and forget all applied rows.
  second.sqlite.pragma('foreign_keys = OFF');
  const tables = second.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations'")
    .all() as { name: string }[];
  for (const t of tables) second.sqlite.exec(`DROP TABLE "${t.name}"`);
  second.sqlite.exec('DELETE FROM __drizzle_migrations');
  second.sqlite.pragma('foreign_keys = ON');
  expect(runMigrations(second, { backupDir }).applied).toBeGreaterThan(0);
  expect(backups()).toHaveLength(1);
  second.sqlite.close();

  // In-memory dbs never get backups.
  mkdirSync(join(dir, 'mem'));
  const mem = openDb(':memory:');
  runMigrations(mem, { backupDir: join(dir, 'mem') });
  expect(readdirSync(join(dir, 'mem'))).toHaveLength(0);
});

test('loadConfig defaults', () => {
  const c = loadConfig({ HOME: '/Users/x' } as any);
  expect(c.dataDir).toBe('/Users/x/LifeTracker');
  expect(c.port).toBe(4280);
  expect(c.allowedOrigins).toContain('http://127.0.0.1:4280');
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { openDb } from '../src/db/client.js';
import { runMigrations, withForeignKeysOff } from '../src/db/migrate.js';

const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
const journal = JSON.parse(readFileSync(`${folder}meta/_journal.json`, 'utf8')) as {
  entries: { tag: string; when: number }[];
};

test('rebuilding a referenced parent table inside a transaction keeps child FK values', () => {
  const { sqlite } = openDb(':memory:');
  sqlite.exec(`
    CREATE TABLE parent (id text PRIMARY KEY NOT NULL, name text);
    CREATE TABLE child (id text PRIMARY KEY NOT NULL, parent_id text REFERENCES parent(id) ON DELETE SET NULL);
    INSERT INTO parent VALUES ('p1', 'a');
    INSERT INTO child VALUES ('c1', 'p1');
  `);
  // Drizzle-kit style rebuild; the PRAGMA inside a transaction is a no-op.
  withForeignKeysOff(sqlite, () =>
    sqlite.transaction(() => {
      sqlite.exec(`
        PRAGMA foreign_keys=OFF;
        CREATE TABLE __new_parent (id text PRIMARY KEY NOT NULL, name text, extra text);
        INSERT INTO __new_parent (id, name) SELECT id, name FROM parent;
        DROP TABLE parent;
        ALTER TABLE __new_parent RENAME TO parent;
      `);
    })(),
  );
  expect(sqlite.prepare("SELECT parent_id FROM child WHERE id='c1'").get()).toEqual({ parent_id: 'p1' });
  expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
});

test('without the guard the same rebuild nulls the child (documents the hazard)', () => {
  const { sqlite } = openDb(':memory:');
  sqlite.exec(`
    CREATE TABLE parent (id text PRIMARY KEY NOT NULL);
    CREATE TABLE child (id text PRIMARY KEY NOT NULL, parent_id text REFERENCES parent(id) ON DELETE SET NULL);
    INSERT INTO parent VALUES ('p1'); INSERT INTO child VALUES ('c1', 'p1');
  `);
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE __n (id text PRIMARY KEY NOT NULL); INSERT INTO __n SELECT id FROM parent;
      DROP TABLE parent; ALTER TABLE __n RENAME TO parent;`);
  })();
  expect(sqlite.prepare("SELECT parent_id FROM child").get()).toEqual({ parent_id: null });
});

test('withForeignKeysOff throws on dangling references and still restores enforcement', () => {
  const { sqlite } = openDb(':memory:');
  sqlite.exec(`
    CREATE TABLE parent (id text PRIMARY KEY NOT NULL);
    CREATE TABLE child (id text PRIMARY KEY NOT NULL, parent_id text REFERENCES parent(id));
  `);
  expect(() => withForeignKeysOff(sqlite, () => sqlite.exec("INSERT INTO child VALUES ('c1', 'ghost')"))).toThrow(
    /Foreign key check failed/,
  );
  expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
});

test('migration 0004 (blocks rebuild) preserves existing blocks and their course link', () => {
  const handle = openDb(':memory:');
  const { sqlite } = handle;
  sqlite.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)');
  for (const e of journal.entries.slice(0, 4)) {
    const sql = readFileSync(`${folder}${e.tag}.sql`, 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) sqlite.exec(stmt);
    sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(e.tag, e.when);
  }
  sqlite.exec(`
    INSERT INTO courses (id, name, color, weekly_goal_minutes, active, created_at, updated_at) VALUES ('c1','Algo','#3f51b5',60,1,'t','t');
    INSERT INTO blocks (id, category, title, start, end, status, source, locked, course_id, created_at, updated_at)
      VALUES ('b1','study','Read','2026-10-14T10:00:00.000Z','2026-10-14T11:00:00.000Z','committed','manual',0,'c1','t','t');
  `);
  expect(runMigrations(handle, {}).applied).toBe(1);
  expect(sqlite.prepare("SELECT id, course_id, startup_task_id FROM blocks").all()).toEqual([
    { id: 'b1', course_id: 'c1', startup_task_id: null },
  ]);
});

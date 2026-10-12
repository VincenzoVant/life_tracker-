import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { ensureCalendarSetup, recreateCalendar } from '../../src/calendar/setup.js';
import { getCalendarState, updateCalendarState } from '../../src/calendar/state.js';
import { blocks } from '../../src/db/schema.js';
import { createBlock, getBlock, setGcalFields } from '../../src/domains/blocks/service.js';
import { FakeCalendarClient } from '../fakes/fakeCalendar.js';
import { createTestCtx } from '../helpers.js';

const mk = (ctx: ReturnType<typeof createTestCtx>, start: string, end: string) =>
  createBlock(ctx, { category: 'study', title: 'x', start, end });

test('first setup creates "Life Tracker" calendar in tz and selects primary as busy', async () => {
  const ctx = createTestCtx();
  const fake = new FakeCalendarClient();
  await ensureCalendarSetup(ctx, fake);
  const s = getCalendarState(ctx);
  expect(s.lifeTrackerCalendarId).toMatch(/^cal-/);
  expect(s.busyCalendarIds).toEqual(['primary']);
  expect(fake.calls.filter((c) => c.method === 'createCalendar')).toHaveLength(1);
});

test('setup is idempotent (no second calendar)', async () => {
  const ctx = createTestCtx();
  const fake = new FakeCalendarClient();
  await ensureCalendarSetup(ctx, fake);
  const first = getCalendarState(ctx);
  await ensureCalendarSetup(ctx, fake);
  expect(getCalendarState(ctx)).toEqual(first);
  expect(fake.calls.filter((c) => c.method === 'createCalendar')).toHaveLength(1);
});

test('recreate makes a new calendar and clears future gcal ids (past ones stay)', async () => {
  const ctx = createTestCtx();
  const fake = new FakeCalendarClient();
  await ensureCalendarSetup(ctx, fake);
  const old = getCalendarState(ctx).lifeTrackerCalendarId;
  const future = mk(ctx, '2026-10-15T10:00:00.000Z', '2026-10-15T11:00:00.000Z');
  const past = mk(ctx, '2026-10-13T10:00:00.000Z', '2026-10-13T11:00:00.000Z');
  for (const b of [future, past]) setGcalFields(ctx, b.id, { gcalEventId: 'e', gcalEtag: 't', gcalHash: 'h', gcalSyncedAt: 's' });
  fake.deleteCalendar(old!);
  updateCalendarState(ctx, { calendarMissing: true, ltSyncToken: 'tok' });
  await recreateCalendar(ctx, fake);
  const s = getCalendarState(ctx);
  expect(s.lifeTrackerCalendarId).not.toBe(old);
  expect(s).toMatchObject({ calendarMissing: false, ltSyncToken: null });
  expect(getBlock(ctx, future.id).gcalEventId).toBeNull();
  const row = ctx.db.select().from(blocks).where(eq(blocks.id, future.id)).get()!;
  expect(row.gcalHash).toBeNull();
  expect(getBlock(ctx, past.id).gcalEventId).toBe('e');
});

test('setGcalFields does not emit and does not change updatedAt', () => {
  const ctx = createTestCtx();
  const b = mk(ctx, '2026-10-15T10:00:00.000Z', '2026-10-15T11:00:00.000Z');
  const seen: unknown[] = [];
  ctx.events.subscribe((c) => seen.push(c));
  ctx.clock.set('2026-10-14T20:00:00.000Z');
  setGcalFields(ctx, b.id, { gcalEventId: 'ev1', gcalEtag: 'et' });
  expect(seen).toEqual([]);
  const after = getBlock(ctx, b.id);
  expect(after.updatedAt).toBe(b.updatedAt);
  expect(after).toMatchObject({ gcalEventId: 'ev1', gcalEtag: 'et' });
});

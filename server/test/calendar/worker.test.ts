import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { CalendarApiError } from '../../src/calendar/client.js';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState } from '../../src/calendar/state.js';
import { backoffSeconds, processQueue } from '../../src/calendar/worker.js';
import { blocks, syncQueue } from '../../src/db/schema.js';
import { createBlock, getBlock, setBlockStatus, updateBlock } from '../../src/domains/blocks/service.js';
import { submitReview } from '../../src/domains/review/service.js';
import { FakeCalendarClient, createFakeGoogle } from '../fakes/fakeCalendar.js';
import { createTestCtx } from '../helpers.js';

type TestCtx = ReturnType<typeof createTestCtx>;

async function setup() {
  const ctx = createTestCtx();
  const fake = new FakeCalendarClient();
  ctx.google = createFakeGoogle(fake);
  await ensureCalendarSetup(ctx, fake);
  return { ctx, fake, calId: getCalendarState(ctx).lifeTrackerCalendarId! };
}

const mk = (ctx: TestCtx, i = 0, day = 15) =>
  createBlock(ctx, {
    category: 'study',
    title: `b${i}`,
    start: `2026-10-${day}T${String(10 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00.000Z`,
    end: `2026-10-${day}T${String(10 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15 + 10).padStart(2, '0')}:00.000Z`,
  });
const queue = (ctx: TestCtx) => ctx.db.select().from(syncQueue).all();
const calls = (fake: FakeCalendarClient, m: string) => fake.calls.filter((c) => c.method === m);

describe('processQueue', () => {
  test('creates events and stores gcal id/etag/hash; queue empty after', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    const r = await processQueue(ctx, fake);
    expect(r).toEqual({ done: 1, failed: 0, paused: null });
    const got = getBlock(ctx, b.id);
    expect(got.gcalEventId).toBeTruthy();
    expect(got.gcalEtag).toBeTruthy();
    expect(ctx.db.select().from(blocks).where(eq(blocks.id, b.id)).get()!.gcalHash).toBeTruthy();
    expect(queue(ctx)).toHaveLength(0);
    expect(fake.events(calId)).toHaveLength(1);
  });

  test('updates patch the event and removal deletes it', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    updateBlock(ctx, b.id, { title: 'renamed' });
    await processQueue(ctx, fake);
    expect(fake.events(calId)[0]!.summary).toBe('renamed');
    setBlockStatus(ctx, b.id, 'removed');
    await processQueue(ctx, fake);
    expect(fake.events(calId)).toHaveLength(0);
    expect(getBlock(ctx, b.id).gcalEventId).toBeNull();
    expect(queue(ctx)).toHaveLength(0);
  });

  test('status-only review changes make zero API calls', async () => {
    const { ctx, fake } = await setup();
    const made = Array.from({ length: 20 }, (_, i) => mk(ctx, i, 14));
    await processQueue(ctx, fake, { limit: 100 });
    expect(queue(ctx)).toHaveLength(0);
    fake.calls.length = 0;
    submitReview(ctx, { date: '2026-10-14', entries: made.map((b) => ({ blockId: b.id, outcome: 'done' as const })), unplanned: [] });
    expect(queue(ctx)).toHaveLength(20);
    await processQueue(ctx, fake, { limit: 100 });
    expect(fake.calls).toHaveLength(0);
    expect(queue(ctx)).toHaveLength(0);
  });

  test('500 then success: attempts 1, next attempt +30s; after clock +30s succeeds', async () => {
    const { ctx, fake } = await setup();
    mk(ctx);
    fake.failNext('insertEvent', new CalendarApiError(500));
    const r = await processQueue(ctx, fake);
    expect(r).toEqual({ done: 0, failed: 1, paused: null });
    const row = queue(ctx)[0]!;
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBe('2026-10-14T19:00:30.000Z');
    expect(row.lastError).toBeTruthy();
    expect(await processQueue(ctx, fake)).toEqual({ done: 0, failed: 0, paused: null });
    ctx.clock.set('2026-10-14T19:00:30.000Z');
    expect(await processQueue(ctx, fake)).toEqual({ done: 1, failed: 0, paused: null });
    expect(queue(ctx)).toHaveLength(0);
  });

  test('backoffSeconds 1→30, 2→60, 8→3600, 20→3600', () => {
    expect([1, 2, 8, 20].map(backoffSeconds)).toEqual([30, 60, 3600, 3600]);
  });

  test('invalid_grant on the second insert: first row stays done, later rows untouched, attempts unchanged; after reconnect flushes in order', async () => {
    const { ctx, fake, calId } = await setup();
    const made = [mk(ctx, 0), mk(ctx, 1), mk(ctx, 2)];
    let inserts = 0;
    const revoking = new Proxy(fake, {
      get(target, prop, recv) {
        if (prop === 'insertEvent') {
          return (...args: Parameters<FakeCalendarClient['insertEvent']>) => {
            if (++inserts === 2) throw new CalendarApiError(401, 'invalid_grant', 'invalid_grant');
            return target.insertEvent(...args);
          };
        }
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const r = await processQueue(ctx, revoking);
    expect(r).toEqual({ done: 1, failed: 0, paused: 'reconnect' });
    expect(ctx.google.needsReconnect()).toBe(true);
    expect(queue(ctx).map((q) => [q.blockId, q.attempts])).toEqual([
      [made[1]!.id, 0],
      [made[2]!.id, 0],
    ]);
    expect(getBlock(ctx, made[0]!.id).gcalEventId).toBeTruthy();
    expect(getBlock(ctx, made[1]!.id).gcalEventId).toBeNull();
    expect(getBlock(ctx, made[2]!.id).gcalEventId).toBeNull();
    // while reconnect is pending the worker short-circuits without any API call
    fake.calls.length = 0;
    expect(await processQueue(ctx, fake)).toEqual({ done: 0, failed: 0, paused: 'reconnect' });
    expect(fake.calls).toEqual([]);
    await ctx.google.completeAuth('code', 'state');
    expect(await processQueue(ctx, fake)).toEqual({ done: 2, failed: 0, paused: null });
    expect(fake.events(calId).map((e) => e.summary)).toEqual(made.map((b) => b.title));
  });

  test('natural re-delete: Google answers 410 for an already-deleted event → success, fields cleared', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    fake.userDelete(calId, getBlock(ctx, b.id).gcalEventId!);
    setBlockStatus(ctx, b.id, 'removed');
    expect(await processQueue(ctx, fake)).toEqual({ done: 1, failed: 0, paused: null });
    expect(calls(fake, 'deleteEvent')).toHaveLength(1);
    expect(queue(ctx)).toHaveLength(0);
    expect(getBlock(ctx, b.id).gcalEventId).toBeNull();
  });

  test('calendarExists probe failing with 401 pauses for reconnect without counting an attempt', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    fake.userDelete(calId, getBlock(ctx, b.id).gcalEventId!);
    updateBlock(ctx, b.id, { title: 'new' });
    fake.failNext('calendarExists', new CalendarApiError(401, 'invalid_grant'));
    expect(await processQueue(ctx, fake)).toMatchObject({ paused: 'reconnect' });
    expect(ctx.google.needsReconnect()).toBe(true);
    expect(queue(ctx).map((q) => q.attempts)).toEqual([0]);
  });

  test('calendarExists probe failing with a network error backs off and does not drop the row', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    fake.userDelete(calId, getBlock(ctx, b.id).gcalEventId!);
    updateBlock(ctx, b.id, { title: 'new' });
    fake.failNext('calendarExists', new CalendarApiError(0, 'offline'));
    expect(await processQueue(ctx, fake)).toEqual({ done: 0, failed: 1, paused: null });
    expect(queue(ctx)).toMatchObject([{ attempts: 1, lastError: 'offline', op: 'update' }]);
    expect(getBlock(ctx, b.id).gcalEventId).toBeTruthy();
  });

  test('delete of already-deleted event (404) counts as success', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    fake.userDelete(calId, getBlock(ctx, b.id).gcalEventId!);
    setBlockStatus(ctx, b.id, 'removed');
    fake.failNext('deleteEvent', new CalendarApiError(404));
    expect(await processQueue(ctx, fake)).toEqual({ done: 1, failed: 0, paused: null });
    expect(queue(ctx)).toHaveLength(0);
    expect(getBlock(ctx, b.id).gcalEventId).toBeNull();
  });

  test('patch 404 with calendar missing → paused calendar_missing', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    updateBlock(ctx, b.id, { title: 'new' });
    fake.deleteCalendar(calId);
    expect(await processQueue(ctx, fake)).toMatchObject({ paused: 'calendar_missing' });
    expect(getCalendarState(ctx).calendarMissing).toBe(true);
    expect(queue(ctx)).toHaveLength(1);
    expect(await processQueue(ctx, fake)).toMatchObject({ paused: 'calendar_missing' });
  });

  test('patch 404 with calendar present → recreated as insert on next run', async () => {
    const { ctx, fake, calId } = await setup();
    const b = mk(ctx);
    await processQueue(ctx, fake);
    const gone = getBlock(ctx, b.id).gcalEventId!;
    fake.userDelete(calId, gone);
    updateBlock(ctx, b.id, { title: 'new' });
    expect(await processQueue(ctx, fake)).toMatchObject({ paused: null });
    expect(getBlock(ctx, b.id).gcalEventId).toBeNull();
    expect(queue(ctx)).toHaveLength(1);
    expect(await processQueue(ctx, fake)).toEqual({ done: 1, failed: 0, paused: null });
    expect(getBlock(ctx, b.id).gcalEventId).toBeTruthy();
    expect(getBlock(ctx, b.id).gcalEventId).not.toBe(gone);
    expect(calls(fake, 'insertEvent')).toHaveLength(2);
  });
});

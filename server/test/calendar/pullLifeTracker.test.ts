import { describe, expect, test } from 'vitest';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState } from '../../src/calendar/state.js';
import { pullLifeTrackerChanges } from '../../src/calendar/pullLifeTracker.js';
import { processQueue } from '../../src/calendar/worker.js';
import { googleChanges, syncQueue } from '../../src/db/schema.js';
import { createBlock, getBlock, setBlockStatus, updateBlock } from '../../src/domains/blocks/service.js';
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

const mk = (ctx: TestCtx, hour = 10, source: 'manual' | 'fixed' = 'manual') =>
  createBlock(
    ctx,
    {
      category: 'study',
      title: `b${hour}`,
      start: `2026-10-15T${String(hour).padStart(2, '0')}:00:00.000Z`,
      end: `2026-10-15T${String(hour).padStart(2, '0')}:30:00.000Z`,
    },
    { source },
  );
const queue = (ctx: TestCtx) => ctx.db.select().from(syncQueue).all();
const changes = (ctx: TestCtx) => ctx.db.select().from(googleChanges).all();

/** Creates the block, pushes it, and consumes the initial pull so later pulls are incremental. */
async function synced(ctx: TestCtx, fake: FakeCalendarClient, hour = 10, source: 'manual' | 'fixed' = 'manual') {
  const b = mk(ctx, hour, source);
  await processQueue(ctx, fake);
  await pullLifeTrackerChanges(ctx, fake);
  return getBlock(ctx, b.id);
}

describe('pullLifeTrackerChanges', () => {
  test('own writes echo back without google_changes or queue rows', async () => {
    const { ctx, fake } = await setup();
    mk(ctx, 10);
    mk(ctx, 11);
    mk(ctx, 12);
    await processQueue(ctx, fake);
    const r = await pullLifeTrackerChanges(ctx, fake);
    expect(r).toEqual({ moved: 0, deleted: 0, fullResync: false });
    expect(changes(ctx)).toHaveLength(0);
    expect(queue(ctx)).toHaveLength(0);
    expect(getCalendarState(ctx).ltSyncToken).toBeTruthy();
    // echo of an update and of a delete as well
    const b = mk(ctx, 13);
    await processQueue(ctx, fake);
    await pullLifeTrackerChanges(ctx, fake);
    updateBlock(ctx, b.id, { title: 'renamed' });
    await processQueue(ctx, fake);
    setBlockStatus(ctx, mk(ctx, 14).id, 'removed');
    expect(await pullLifeTrackerChanges(ctx, fake)).toMatchObject({ moved: 0, deleted: 0 });
    expect(changes(ctx)).toHaveLength(0);
    expect(queue(ctx)).toHaveLength(0);
  });

  test('user moves event in Google → block times updated, moved change recorded, no queue row', async () => {
    const { ctx, fake, calId } = await setup();
    const b = await synced(ctx, fake);
    fake.userMove(calId, b.gcalEventId!, '2026-10-15T12:00:00.000Z', '2026-10-15T12:30:00.000Z', '2026-10-14T20:00:00.000Z');
    const r = await pullLifeTrackerChanges(ctx, fake);
    expect(r.moved).toBe(1);
    const after = getBlock(ctx, b.id);
    expect(after.start).toBe('2026-10-15T12:00:00.000Z');
    expect(after.end).toBe('2026-10-15T12:30:00.000Z');
    expect(changes(ctx)).toMatchObject([
      { blockId: b.id, kind: 'moved', beforeStart: b.start, afterStart: '2026-10-15T12:00:00.000Z', seen: false },
    ]);
    expect(queue(ctx)).toHaveLength(0);
    // the follow-up pull (echo of nothing) stays quiet
    expect(await pullLifeTrackerChanges(ctx, fake)).toMatchObject({ moved: 0 });
  });

  test('user deletes event → committed block removed, deleted change recorded, no delete op queued', async () => {
    const { ctx, fake, calId } = await setup();
    const b = await synced(ctx, fake);
    fake.userDelete(calId, b.gcalEventId!);
    const r = await pullLifeTrackerChanges(ctx, fake);
    expect(r.deleted).toBe(1);
    expect(getBlock(ctx, b.id)).toMatchObject({ status: 'removed', gcalEventId: null });
    expect(changes(ctx)).toMatchObject([{ blockId: b.id, kind: 'deleted' }]);
    expect(queue(ctx)).toHaveLength(0);
  });

  test('deleted event for a reviewed block keeps block status', async () => {
    const { ctx, fake, calId } = await setup();
    const b = await synced(ctx, fake);
    setBlockStatus(ctx, b.id, 'done');
    fake.userDelete(calId, b.gcalEventId!);
    const r = await pullLifeTrackerChanges(ctx, fake);
    expect(r.deleted).toBe(0);
    expect(getBlock(ctx, b.id)).toMatchObject({ status: 'done', gcalEventId: null });
    expect(changes(ctx)).toHaveLength(0);
  });

  test('both edited: app newer → re-enqueued update; Google newer → block takes Google times', async () => {
    const { ctx, fake, calId } = await setup();
    const a = await synced(ctx, fake, 10);
    const g = await synced(ctx, fake, 11);

    ctx.clock.set('2026-10-14T20:00:00.000Z');
    updateBlock(ctx, a.id, { start: '2026-10-15T15:00:00.000Z', end: '2026-10-15T15:30:00.000Z' });
    await processQueue(ctx, fake);
    // Google edit older than the app edit
    fake.userMove(calId, a.gcalEventId!, '2026-10-15T16:00:00.000Z', '2026-10-15T16:30:00.000Z', '2026-10-14T19:30:00.000Z');
    expect(await pullLifeTrackerChanges(ctx, fake)).toMatchObject({ moved: 0 });
    expect(queue(ctx)).toHaveLength(1);
    await processQueue(ctx, fake);
    expect(fake.events(calId).find((e) => e.id === a.gcalEventId)!.start?.dateTime).toBe('2026-10-15T15:00:00.000Z');
    expect(getBlock(ctx, a.id).start).toBe('2026-10-15T15:00:00.000Z');

    // Google edit newer than the block's last update
    updateBlock(ctx, g.id, { title: 'app edit' });
    await processQueue(ctx, fake);
    fake.userMove(calId, g.gcalEventId!, '2026-10-15T17:00:00.000Z', '2026-10-15T17:30:00.000Z', '2026-10-14T21:00:00.000Z');
    expect(await pullLifeTrackerChanges(ctx, fake)).toMatchObject({ moved: 1 });
    expect(getBlock(ctx, g.id).start).toBe('2026-10-15T17:00:00.000Z');
    expect(queue(ctx)).toHaveLength(0);
  });

  test('410 triggers full resync and stores new token', async () => {
    const { ctx, fake } = await setup();
    await synced(ctx, fake);
    const old = getCalendarState(ctx).ltSyncToken;
    fake.expireSyncTokens();
    const r = await pullLifeTrackerChanges(ctx, fake);
    expect(r).toEqual({ moved: 0, deleted: 0, fullResync: true });
    const token = getCalendarState(ctx).ltSyncToken;
    expect(token).toBeTruthy();
    expect(token).not.toBe(old);
    expect(changes(ctx)).toHaveLength(0);
    expect(queue(ctx)).toHaveLength(0);
  });

  test('fixed class moved in Google updates the fixed block', async () => {
    const { ctx, fake, calId } = await setup();
    const b = await synced(ctx, fake, 10, 'fixed');
    fake.userMove(calId, b.gcalEventId!, '2026-10-15T13:00:00.000Z', '2026-10-15T13:30:00.000Z', '2026-10-14T20:00:00.000Z');
    expect(await pullLifeTrackerChanges(ctx, fake)).toMatchObject({ moved: 1 });
    expect(getBlock(ctx, b.id)).toMatchObject({ source: 'fixed', start: '2026-10-15T13:00:00.000Z' });
  });

  test('all-day events and unknown events are ignored; missing calendar sets calendarMissing', async () => {
    const { ctx, fake, calId } = await setup();
    fake.addExternalEvent(calId, { start: { date: '2026-10-15' }, end: { date: '2026-10-16' } });
    expect(await pullLifeTrackerChanges(ctx, fake)).toEqual({ moved: 0, deleted: 0, fullResync: false });
    fake.deleteCalendar(calId);
    await pullLifeTrackerChanges(ctx, fake);
    expect(getCalendarState(ctx).calendarMissing).toBe(true);
  });
});

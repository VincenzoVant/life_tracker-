import { describe, expect, test, vi } from 'vitest';
import { runSync } from '../../src/calendar/runSync.js';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState } from '../../src/calendar/state.js';
import { processQueue } from '../../src/calendar/worker.js';
import { syncQueue } from '../../src/db/schema.js';
import { createBlock, getBlock, setBlockStatus, updateBlock } from '../../src/domains/blocks/service.js';
import { FakeCalendarClient, createFakeGoogle } from '../fakes/fakeCalendar.js';
import { createTestClient } from '../helpers.js';

async function setup() {
  const c = await createTestClient();
  const fake = new FakeCalendarClient();
  c.ctx.google = createFakeGoogle(fake);
  await ensureCalendarSetup(c.ctx, fake);
  return { c, fake, ctx: c.ctx, calId: () => getCalendarState(c.ctx).lifeTrackerCalendarId! };
}

const FUTURE = { start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' };
const queue = (ctx: Awaited<ReturnType<typeof setup>>['ctx']) => ctx.db.select().from(syncQueue).all();

describe('B1 runSync order', () => {
  test('a Google move wins over a queued app rename, and the rename still reaches Google', async () => {
    const { ctx, fake, calId } = await setup();
    const b = createBlock(ctx, { category: 'study', title: 'Study', ...FUTURE });
    await runSync(ctx);
    const eventId = getBlock(ctx, b.id).gcalEventId!;
    ctx.clock.set('2026-10-14T19:10:00.000Z');
    updateBlock(ctx, b.id, { title: 'Study renamed' }); // queued, not yet pushed
    fake.userMove(calId(), eventId, '2026-10-15T14:00:00.000Z', '2026-10-15T15:00:00.000Z', '2026-10-14T19:20:00.000Z');
    await runSync(ctx);
    const got = getBlock(ctx, b.id);
    expect(got).toMatchObject({ start: '2026-10-15T14:00:00.000Z', end: '2026-10-15T15:00:00.000Z', title: 'Study renamed' });
    const ev = fake.events(calId()).find((e) => e.id === eventId)!;
    expect(ev.summary).toBe('Study renamed');
    expect(ev.start?.dateTime).toBe('2026-10-15T14:00:00.000Z');
    expect(queue(ctx)).toHaveLength(0);
  });
});

describe('B2 recreate calendar', () => {
  test('past reviewed/committed blocks survive a recreate; second recreate is 409', async () => {
    const { c, ctx, fake, calId } = await setup();
    ctx.clock.set('2026-10-13T12:00:00.000Z');
    const past = createBlock(ctx, { category: 'study', title: 'Past', start: '2026-10-13T10:00:00.000Z', end: '2026-10-13T11:00:00.000Z' });
    await runSync(ctx);
    expect(getBlock(ctx, past.id).gcalEventId).toBeTruthy();
    ctx.clock.set('2026-10-14T19:00:00.000Z'); // the past block is now more than 24h old
    fake.deleteCalendar(calId());
    createBlock(ctx, { category: 'study', title: 'Future', ...FUTURE });
    await runSync(ctx); // 404 on create → calendar missing
    expect(getCalendarState(ctx).calendarMissing).toBe(true);
    expect((await c.post('/api/google/recreate-calendar')).status).toBe(200);
    await runSync(ctx);
    expect(getBlock(ctx, past.id).status).toBe('committed');
    expect(fake.events(calId())).toHaveLength(1); // only the future block was recreated
    expect((await c.post('/api/google/recreate-calendar')).status).toBe(409);
  });
});

describe('B-M1 removal during an in-flight create', () => {
  test('the phantom Google event is deleted afterwards', async () => {
    const { ctx, fake, calId } = await setup();
    const b = createBlock(ctx, { category: 'study', title: 'Study', ...FUTURE });
    const orig = fake.insertEvent.bind(fake);
    fake.insertEvent = async (...args: Parameters<typeof orig>) => {
      const ev = await orig(...args);
      setBlockStatus(ctx, b.id, 'removed'); // user removes it while the create is in flight
      return ev;
    };
    await processQueue(ctx, fake);
    expect(fake.events(calId())).toHaveLength(1);
    expect(queue(ctx)).toMatchObject([{ blockId: b.id, op: 'delete' }]);
    await processQueue(ctx, fake);
    expect(fake.events(calId())).toHaveLength(0);
    expect(queue(ctx)).toHaveLength(0);
  });
});

describe('B-M3 status-only changes', () => {
  test('a status change that leaves the event body unchanged does not queue anything', async () => {
    const { ctx } = await setup();
    const b = createBlock(ctx, { category: 'study', title: 'Study', ...FUTURE });
    await runSync(ctx);
    expect(queue(ctx)).toHaveLength(0);
    setBlockStatus(ctx, b.id, 'done');
    expect(queue(ctx)).toHaveLength(0);
  });
});

describe('B-M5 oauth callback', () => {
  test('redirects without waiting for the first sync', async () => {
    const { c, ctx, fake } = await setup();
    createBlock(ctx, { category: 'study', title: 'Study', ...FUTURE });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const orig = fake.insertEvent.bind(fake);
    fake.insertEvent = async (...args: Parameters<typeof orig>) => {
      await gate;
      return orig(...args);
    };
    const res = await Promise.race([
      c.get('/api/google/callback?code=abc&state=xyz'),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 500)),
    ]);
    release();
    expect(res).not.toBe('hung');
    expect((res as { status: number }).status).toBe(302);
    await runSync(ctx);
  });
});

describe('enqueue failures are logged', () => {
  test('a throwing enqueue is reported via console.error and never breaks the caller', async () => {
    const { ctx } = await setup();
    const a = createBlock(ctx, { category: 'study', title: 'Study', ...FUTURE });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      ctx.sqlite.exec('drop table sync_queue');
      expect(() => updateBlock(ctx, a.id, { title: 'q' })).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('reviewing a long-past block after a recreate', () => {
  test('does not create a past event in the new calendar', async () => {
    const { c, ctx, fake, calId } = await setup();
    ctx.clock.set('2026-10-13T12:00:00.000Z');
    const past = createBlock(ctx, { category: 'study', title: 'Past', start: '2026-10-13T10:00:00.000Z', end: '2026-10-13T11:00:00.000Z' });
    await runSync(ctx);
    ctx.clock.set('2026-10-14T19:00:00.000Z');
    fake.deleteCalendar(calId());
    createBlock(ctx, { category: 'study', title: 'Future', ...FUTURE });
    await runSync(ctx);
    expect((await c.post('/api/google/recreate-calendar')).status).toBe(200);
    setBlockStatus(ctx, past.id, 'done');
    await runSync(ctx);
    expect(getBlock(ctx, past.id).gcalEventId).toBeNull();
    expect(fake.events(calId())).toHaveLength(1);
  });
});

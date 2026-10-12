import { describe, expect, test } from 'vitest';
import { CATEGORY_META, type Block } from '@life-tracker/shared';
import { CalendarApiError } from '../../src/calendar/client.js';
import { runSync } from '../../src/calendar/runSync.js';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState } from '../../src/calendar/state.js';
import { createBlock, setBlockStatus } from '../../src/domains/blocks/service.js';
import { saveGoals } from '../../src/domains/goals/service.js';
import { createCourse } from '../../src/domains/studies/service.js';
import { FakeCalendarClient, createFakeGoogle } from '../fakes/fakeCalendar.js';
import { createTestClient } from '../helpers.js';

async function setup(connect = true) {
  const c = await createTestClient();
  const fake = new FakeCalendarClient();
  c.ctx.google = createFakeGoogle(fake);
  if (connect) await ensureCalendarSetup(c.ctx, fake);
  return { c, fake, ctx: c.ctx };
}

const GOALS = {
  startupMinutes: 120,
  workoutsTotal: null,
  workoutsByType: { gym: 1, cardio: null, sport: null },
  freeEvenings: 1,
  dailyKcal: null,
  dailyProteinG: null,
};

describe('runSync', () => {
  test('runSync with Google down (status 0 on everything) leaves app usable and records lastError', async () => {
    const { c, fake, ctx } = await setup();
    const down = new CalendarApiError(0, 'network down');
    fake.failNext('insertEvent', down, 200);
    fake.failNext('listEvents', down, 200);
    fake.failNext('patchEvent', down, 200);

    const past = createBlock(ctx, { category: 'study', title: 'Reviewed', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    setBlockStatus(ctx, past.id, 'done');
    createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 240 });
    saveGoals(ctx, GOALS);
    const plan = await c.post('/api/plans', { weekStart: '2026-10-19' });
    expect(plan.status).toBe(201);
    expect((await c.post(`/api/plans/${plan.body.plan.id}/commit`)).status).toBe(200);

    await runSync(ctx);
    const status = await c.get('/api/google/status');
    expect(status.status).toBe(200);
    expect(status.body.pending).toBeGreaterThan(0);
    expect(status.body.failing).toBeGreaterThan(0);
    expect(status.body.lastError).toBeTruthy();
    expect(getCalendarState(ctx).lastSyncAt).toBe(ctx.clock.now().toISOString());
    expect((await c.get('/api/blocks?from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z')).status).toBe(200);
  });

  test('runSync end-to-end with fake: commit week → events exist in Life Tracker calendar with colors', async () => {
    const { c, ctx, fake } = await setup();
    createCourse(ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 240 });
    saveGoals(ctx, GOALS);
    const plan = await c.post('/api/plans', { weekStart: '2026-10-19' });
    await c.post(`/api/plans/${plan.body.plan.id}/commit`);
    const blocks = plan.body.blocks as Block[];
    const r = await runSync(ctx);
    expect(r.skipped).toBeUndefined();
    const events = fake.events(getCalendarState(ctx).lifeTrackerCalendarId!);
    expect(events).toHaveLength(blocks.length);
    const study = blocks.find((b) => b.category === 'study')!;
    expect(events.find((e) => e.extendedProperties?.private?.lifeTrackerBlockId === study.id)?.colorId).toBe(CATEGORY_META.study.gcalColorId);
    const status = await c.get('/api/sync/status');
    expect(status.body).toMatchObject({ pending: 0, failing: [], lastError: null });
  });

  test('busy changes from Google open a conflict via runSync', async () => {
    const { c, ctx, fake } = await setup();
    createBlock(ctx, { category: 'study', title: 'Study', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    fake.addExternalEvent('primary', { summary: 'Dentist', start: { dateTime: '2026-10-15T10:30:00Z' }, end: { dateTime: '2026-10-15T11:30:00Z' } });
    await c.post('/api/sync/now');
    const conflicts = await c.get('/api/conflicts?status=open');
    expect(conflicts.body).toHaveLength(1);
    expect(conflicts.body[0]).toMatchObject({ title: 'Dentist', status: 'open' });
    const dismissed = await c.post(`/api/conflicts/${conflicts.body[0].id}/dismiss`);
    expect(dismissed.body.status).toBe('dismissed');
    expect((await c.get('/api/conflicts?status=open')).body).toEqual([]);
  });

  test('skips when not connected, needing reconnect, or calendar missing', async () => {
    const { ctx, fake } = await setup();
    ctx.google.markNeedsReconnect();
    expect(await runSync(ctx)).toEqual({ skipped: 'reconnect' });
    ctx.google = { ...createFakeGoogle(fake), isConnected: () => false };
    expect(await runSync(ctx)).toEqual({ skipped: 'not_connected' });
    const fresh = await setup();
    fresh.fake.deleteCalendar(getCalendarState(fresh.ctx).lifeTrackerCalendarId!);
    createBlock(fresh.ctx, { category: 'study', title: 's', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    await runSync(fresh.ctx);
    expect(await runSync(fresh.ctx)).toEqual({ skipped: 'calendar_missing' });
  });

  test('concurrent runSync calls share one run', async () => {
    const { ctx, fake } = await setup();
    createBlock(ctx, { category: 'study', title: 's', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    const [a, b] = [runSync(ctx), runSync(ctx)];
    expect(a).toBe(b);
    await a;
    expect(fake.calls.filter((x) => x.method === 'insertEvent')).toHaveLength(1);
    expect(runSync(ctx)).not.toBe(a);
  });

  test('status reports pending and failing counts', async () => {
    const { c, ctx, fake } = await setup();
    fake.failNext('insertEvent', new CalendarApiError(500, 'boom'), 1);
    createBlock(ctx, { category: 'study', title: 'Bad', start: '2026-10-15T10:00:00.000Z', end: '2026-10-15T11:00:00.000Z' });
    createBlock(ctx, { category: 'study', title: 'Good', start: '2026-10-15T12:00:00.000Z', end: '2026-10-15T13:00:00.000Z' });
    expect((await c.get('/api/sync/status')).body.pending).toBe(2);
    const after = await c.post('/api/sync/now');
    expect(after.body.pending).toBe(1);
    expect(after.body.failing).toMatchObject([{ title: 'Bad', attempts: 1, lastError: 'boom' }]);
    expect(after.body.lastError).toBe('boom');
    const st = await c.get('/api/google/status');
    expect(st.body).toMatchObject({ connected: true, pending: 1, failing: 1, includeAllDay: false, busyCalendarIds: ['primary'] });
  });
});

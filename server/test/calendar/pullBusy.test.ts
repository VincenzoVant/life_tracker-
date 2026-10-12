import { describe, expect, test } from 'vitest';
import { zonedToUtc, type Block } from '@life-tracker/shared';
import { createCachedBusyProvider } from '../../src/calendar/busyProvider.js';
import { isBusyEvent, pullBusyCalendars } from '../../src/calendar/pullBusy.js';
import { ensureCalendarSetup } from '../../src/calendar/setup.js';
import { getCalendarState, updateCalendarState } from '../../src/calendar/state.js';
import { busyEvents } from '../../src/db/schema.js';
import { listBlocks } from '../../src/domains/blocks/service.js';
import { saveGoals } from '../../src/domains/goals/service.js';
import { createCourse } from '../../src/domains/studies/service.js';
import { FakeCalendarClient, createFakeGoogle } from '../fakes/fakeCalendar.js';
import { createTestClient, createTestCtx } from '../helpers.js';

const TZ = 'America/Los_Angeles';
const iso = (date: string, time: string): string => zonedToUtc(date, time, TZ).toISOString();
// Default test clock: Wed 2026-10-14 12:00 PDT.

async function setup() {
  const ctx = createTestCtx();
  const fake = new FakeCalendarClient();
  ctx.google = createFakeGoogle(fake);
  await ensureCalendarSetup(ctx, fake); // selects 'primary' as busy
  return { ctx, fake };
}
const timed = (start: string, end: string) => ({ start: { dateTime: start }, end: { dateTime: end } });
const rows = (ctx: ReturnType<typeof createTestCtx>) => ctx.db.select().from(busyEvents).all();

describe('pullBusyCalendars', () => {
  test('recurring event occurrences (singleEvents) each become busy rows', async () => {
    const { ctx, fake } = await setup();
    for (const [i, day] of ['2026-10-15', '2026-10-22', '2026-10-29'].entries()) {
      fake.addExternalEvent('primary', { id: `standup_${i}`, summary: 'Standup', ...timed(`${day}T16:00:00Z`, `${day}T16:30:00Z`) });
    }
    const r = await pullBusyCalendars(ctx, fake);
    expect(r.changed).toHaveLength(3);
    expect(r.removed).toEqual([]);
    expect(rows(ctx).map((x) => x.eventId).sort()).toEqual(['standup_0', 'standup_1', 'standup_2']);
    // paged fetch (page size 2) and no second change on an identical re-pull
    expect((await pullBusyCalendars(ctx, fake)).changed).toEqual([]);
  });

  test('declined, transparent and all-day (default) events are excluded', async () => {
    const { ctx, fake } = await setup();
    fake.addExternalEvent('primary', { id: 'ok', ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    fake.addExternalEvent('primary', { id: 'declined', ...timed('2026-10-15T18:00:00Z', '2026-10-15T19:00:00Z'), attendees: [{ self: true, responseStatus: 'declined' }] });
    fake.addExternalEvent('primary', { id: 'free', ...timed('2026-10-15T20:00:00Z', '2026-10-15T21:00:00Z'), transparency: 'transparent' });
    fake.addExternalEvent('primary', { id: 'allday', start: { date: '2026-10-16' }, end: { date: '2026-10-17' } });
    fake.addExternalEvent('primary', { id: 'cancelled', status: 'cancelled', ...timed('2026-10-15T22:00:00Z', '2026-10-15T23:00:00Z') });
    await pullBusyCalendars(ctx, fake);
    expect(rows(ctx).map((x) => x.eventId)).toEqual(['ok']);
    const otherDeclined = { id: 'x', status: 'confirmed' as const, updated: '', etag: '', attendees: [{ self: false, responseStatus: 'declined' }], ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') };
    expect(isBusyEvent(otherDeclined, false)).toBe(true);
  });

  test('includeAllDay=true maps all-day event to local midnight..midnight', async () => {
    const { ctx, fake } = await setup();
    updateCalendarState(ctx, { includeAllDay: true });
    fake.addExternalEvent('primary', { id: 'allday', start: { date: '2026-10-16' }, end: { date: '2026-10-18' } });
    await pullBusyCalendars(ctx, fake);
    expect(rows(ctx)).toMatchObject([{ eventId: 'allday', title: 'Busy', start: iso('2026-10-16', '00:00'), end: iso('2026-10-18', '00:00') }]);
  });

  test('event removed in Google disappears from cache and is reported in removed', async () => {
    const { ctx, fake } = await setup();
    const ev = fake.addExternalEvent('primary', { summary: 'Dentist', ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    await pullBusyCalendars(ctx, fake);
    fake.userDelete('primary', ev.id);
    const r = await pullBusyCalendars(ctx, fake);
    expect(r.changed).toEqual([]);
    expect(r.removed).toMatchObject([{ calendarId: 'primary', eventId: ev.id, title: 'Dentist' }]);
    expect(rows(ctx)).toEqual([]);
  });

  test('changed event (newer updated) is upserted and reported', async () => {
    const { ctx, fake } = await setup();
    const ev = fake.addExternalEvent('primary', { summary: 'Dentist', ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    await pullBusyCalendars(ctx, fake);
    fake.userMove('primary', ev.id, '2026-10-15T18:00:00Z', '2026-10-15T19:00:00Z', '2026-10-14T20:00:00.000Z');
    const r = await pullBusyCalendars(ctx, fake);
    expect(r.changed).toMatchObject([{ eventId: ev.id, start: '2026-10-15T18:00:00.000Z' }]);
    expect(rows(ctx)).toHaveLength(1);
  });

  test('Life Tracker calendar never pulled as busy even if selected', async () => {
    const { ctx, fake } = await setup();
    const lt = getCalendarState(ctx).lifeTrackerCalendarId!;
    fake.addExternalEvent(lt, { summary: 'mirrored', ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    updateCalendarState(ctx, { busyCalendarIds: ['primary', lt] });
    fake.calls.length = 0;
    await pullBusyCalendars(ctx, fake);
    expect(rows(ctx)).toEqual([]);
    expect(fake.calls.every((c) => c.calendarId !== lt)).toBe(true);
  });

  test('deselected calendar drops out of the cache', async () => {
    const { ctx, fake } = await setup();
    fake.addExternalEvent('primary', { ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    await pullBusyCalendars(ctx, fake);
    updateCalendarState(ctx, { busyCalendarIds: [] });
    const r = await pullBusyCalendars(ctx, fake);
    expect(r.removed).toHaveLength(1);
    expect(rows(ctx)).toEqual([]);
  });
});

describe('cached busy provider', () => {
  test('returns rows overlapping [from, to) with calendar and event ids', async () => {
    const { ctx, fake } = await setup();
    const ev = fake.addExternalEvent('primary', { summary: 'Dentist', ...timed('2026-10-15T16:00:00Z', '2026-10-15T17:00:00Z') });
    await pullBusyCalendars(ctx, fake);
    const p = createCachedBusyProvider(ctx);
    expect(p.busyIntervals(new Date('2026-10-15T16:30:00Z'), new Date('2026-10-15T18:00:00Z'))).toEqual([
      { start: '2026-10-15T16:00:00.000Z', end: '2026-10-15T17:00:00.000Z', title: 'Dentist', calendarId: 'primary', externalEventId: ev.id },
    ]);
    expect(p.busyIntervals(new Date('2026-10-15T17:00:00Z'), new Date('2026-10-15T18:00:00Z'))).toEqual([]);
  });

  test('busy provider feeds planner: plan next week avoids a cached busy event', async () => {
    const c = await createTestClient();
    createCourse(c.ctx, { name: 'Algebra', color: '#3366ff', weeklyGoalMinutes: 600 });
    saveGoals(c.ctx, { startupMinutes: 300, workoutsTotal: null, workoutsByType: { gym: 2, cardio: null, sport: null }, freeEvenings: 2, dailyKcal: null, dailyProteinG: null });
    const nonMeal = (b: Block[]) => b.filter((x) => x.category !== 'meal');
    const baseline = await c.post('/api/plans', { weekStart: '2026-10-19' });
    const busyStart = iso('2026-10-19', '09:00');
    const busyEnd = iso('2026-10-19', '21:00');
    const overlaps = (b: Block) => b.start < busyEnd && b.end > busyStart;
    expect(nonMeal(baseline.body.blocks as Block[]).some(overlaps)).toBe(true); // otherwise the test proves nothing

    const fake = new FakeCalendarClient();
    c.ctx.google = createFakeGoogle(fake);
    await ensureCalendarSetup(c.ctx, fake);
    fake.addExternalEvent('primary', { summary: 'Conference', ...timed(busyStart, busyEnd) });
    await pullBusyCalendars(c.ctx, fake);

    const replanned = await c.post('/api/plans', { weekStart: '2026-10-19' });
    expect(replanned.status).toBe(201);
    expect(nonMeal(replanned.body.blocks as Block[]).filter(overlaps)).toEqual([]);
    const stored = listBlocks(c.ctx, { from: new Date(busyStart), to: new Date(busyEnd) });
    expect(stored.filter((b) => b.status === 'proposed' && b.category !== 'meal')).toEqual([]);
  });
});

import { describe, expect, test } from 'vitest';
import { CalendarApiError } from '../../src/calendar/client.js';
import { FakeCalendarClient } from '../fakes/fakeCalendar.js';

const body = (n: number) => ({
  summary: `e${n}`,
  start: { dateTime: `2026-10-1${n}T10:00:00Z` },
  end: { dateTime: `2026-10-1${n}T11:00:00Z` },
});

async function listAll(fake: FakeCalendarClient, calId: string, q: Parameters<FakeCalendarClient['listEvents']>[1] = {}) {
  const items = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let pages = 0;
  do {
    const r = await fake.listEvents(calId, { ...q, ...(pageToken ? { pageToken } : {}) });
    items.push(...r.items);
    pageToken = r.nextPageToken;
    nextSyncToken = r.nextSyncToken;
    pages++;
  } while (pageToken);
  return { items, nextSyncToken, pages };
}

describe('FakeCalendarClient', () => {
  test('insert → list with syncToken returns only changes since token, with pagination', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    await fake.insertEvent(id, body(1));
    await fake.insertEvent(id, body(2));
    await fake.insertEvent(id, body(3));
    const full = await listAll(fake, id);
    expect(full.items).toHaveLength(3);
    expect(full.pages).toBe(2);
    expect(full.nextSyncToken).toBeTruthy();

    await fake.insertEvent(id, body(4));
    const inc = await listAll(fake, id, { syncToken: full.nextSyncToken! });
    expect(inc.items.map((e) => e.summary)).toEqual(['e4']);
    expect(inc.nextSyncToken).not.toBe(full.nextSyncToken);
  });

  test('deleted event appears as cancelled tombstone in incremental list', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const ev = await fake.insertEvent(id, body(1));
    const { nextSyncToken } = await listAll(fake, id);
    await fake.deleteEvent(id, ev.id);
    const inc = await listAll(fake, id, { syncToken: nextSyncToken! });
    expect(inc.items).toHaveLength(1);
    expect(inc.items[0]).toMatchObject({ id: ev.id, status: 'cancelled' });
    expect((await listAll(fake, id)).items).toHaveLength(0);
  });

  test('expired sync token throws 410', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    await fake.insertEvent(id, body(1));
    const { nextSyncToken } = await listAll(fake, id);
    fake.expireSyncTokens();
    await expect(fake.listEvents(id, { syncToken: nextSyncToken! })).rejects.toMatchObject({ status: 410 });
    const fresh = await listAll(fake, id);
    await expect(fake.listEvents(id, { syncToken: fresh.nextSyncToken! })).resolves.toBeTruthy();
  });

  test('failNext throws configured error once then succeeds', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    fake.failNext('insertEvent', new CalendarApiError(429, 'slow down', 'rateLimitExceeded'));
    await expect(fake.insertEvent(id, body(1))).rejects.toMatchObject({ status: 429, reason: 'rateLimitExceeded' });
    await expect(fake.insertEvent(id, body(1))).resolves.toMatchObject({ summary: 'e1' });
    expect(fake.calls.filter((c) => c.method === 'insertEvent')).toHaveLength(2);
  });

  test('deleted calendar → 404 on any call', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    expect(await fake.calendarExists(id)).toBe(true);
    fake.deleteCalendar(id);
    expect(await fake.calendarExists(id)).toBe(false);
    await expect(fake.insertEvent(id, body(1))).rejects.toMatchObject({ status: 404 });
    await expect(fake.listEvents(id, {})).rejects.toMatchObject({ status: 404 });
    await expect(fake.patchEvent(id, 'x', {})).rejects.toMatchObject({ status: 404 });
    await expect(fake.deleteEvent(id, 'x')).rejects.toMatchObject({ status: 404 });
  });

  test('timeMin/timeMax filters by overlap; userMove and external events work', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const ev = await fake.insertEvent(id, body(1));
    fake.addExternalEvent(id, { start: { dateTime: '2026-10-15T10:00:00Z' }, end: { dateTime: '2026-10-15T11:00:00Z' } });
    const r = await listAll(fake, id, { timeMin: '2026-10-15T00:00:00Z', timeMax: '2026-10-16T00:00:00Z' });
    expect(r.items).toHaveLength(1);
    fake.userMove(id, ev.id, '2026-10-15T12:00:00Z', '2026-10-15T13:00:00Z', '2026-10-14T20:00:00.000Z');
    const moved = fake.events(id).find((e) => e.id === ev.id)!;
    expect(moved.start?.dateTime).toBe('2026-10-15T12:00:00Z');
    expect(moved.updated).toBe('2026-10-14T20:00:00.000Z');
  });

  test('addExternalEvent honors a supplied updated timestamp', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const ev = fake.addExternalEvent(id, { ...body(1), updated: '2026-01-01T00:00:00.000Z' });
    expect(ev.updated).toBe('2026-01-01T00:00:00.000Z');
    expect(fake.events(id)[0]!.updated).toBe('2026-01-01T00:00:00.000Z');
  });

  test('deleting an already-deleted event is 410, unknown id is 404', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const ev = await fake.insertEvent(id, body(1));
    await fake.deleteEvent(id, ev.id);
    await expect(fake.deleteEvent(id, ev.id)).rejects.toMatchObject({ status: 410 });
    await expect(fake.deleteEvent(id, 'nope')).rejects.toMatchObject({ status: 404 });
  });

  test('syncToken combined with timeMin/timeMax is rejected with 400', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const { nextSyncToken } = await listAll(fake, id);
    await expect(fake.listEvents(id, { syncToken: nextSyncToken!, timeMin: '2026-10-15T00:00:00Z' })).rejects.toMatchObject({ status: 400 });
  });

  test('failNext queues multiple errors per method in order', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    fake.failNext('insertEvent', new CalendarApiError(429));
    fake.failNext('insertEvent', new CalendarApiError(500));
    await expect(fake.insertEvent(id, body(1))).rejects.toMatchObject({ status: 429 });
    await expect(fake.insertEvent(id, body(1))).rejects.toMatchObject({ status: 500 });
    await expect(fake.insertEvent(id, body(1))).resolves.toBeTruthy();
  });

  test('returned and stored events are deep copies', async () => {
    const fake = new FakeCalendarClient();
    const { id } = await fake.createCalendar('Life Tracker', 'UTC');
    const ev = await fake.insertEvent(id, { ...body(1), extendedProperties: { private: { a: '1' } } });
    ev.extendedProperties!.private!.a = 'changed';
    expect(fake.events(id)[0]!.extendedProperties!.private!.a).toBe('1');
  });
});

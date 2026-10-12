import { CalendarApiError, type CalendarClient, type EventBody, type GEvent, type ListEventsQuery } from '../../src/calendar/client.js';

const PAGE_SIZE = 2;

interface Stored {
  event: GEvent;
  seq: number;
}

interface FakeCal {
  summary: string;
  primary: boolean;
  events: Map<string, Stored>;
}

export class FakeCalendarClient implements CalendarClient {
  calls: Array<{ method: string; calendarId: string; eventId?: string }> = [];
  /** Settable clock used for `updated` on every mutation. */
  now = '2026-10-14T19:00:00.000Z';

  private seq = 0;
  private idCounter = 0;
  private expiredBefore = 0;
  private calendars = new Map<string, FakeCal>();
  private failures = new Map<string, { error: CalendarApiError; times: number }>();

  constructor() {
    this.calendars.set('primary', { summary: 'Primary', primary: true, events: new Map() });
  }

  failNext(method: keyof CalendarClient, error: CalendarApiError, times = 1): void {
    this.failures.set(method, { error, times });
  }

  addExternalEvent(calendarId: string, partial: Partial<GEvent> & { start: GEvent['start']; end: GEvent['end'] }): GEvent {
    const cal = this.cal(calendarId);
    const id = partial.id ?? `ext-${++this.idCounter}`;
    const event = this.stamp({ status: 'confirmed', ...partial, id } as GEvent);
    cal.events.set(id, { event, seq: this.seq });
    return { ...event };
  }

  userMove(calendarId: string, eventId: string, start: string, end: string, updatedAt: string): void {
    const stored = this.mustGet(calendarId, eventId);
    this.seq++;
    stored.event = {
      ...stored.event,
      start: { ...stored.event.start, dateTime: start },
      end: { ...stored.event.end, dateTime: end },
      updated: updatedAt,
      etag: `seq-${this.seq}`,
    };
    stored.seq = this.seq;
  }

  userDelete(calendarId: string, eventId: string): void {
    this.tombstone(this.cal(calendarId), eventId);
  }

  deleteCalendar(calendarId: string): void {
    this.calendars.delete(calendarId);
  }

  expireSyncTokens(): void {
    this.seq++;
    this.expiredBefore = this.seq;
  }

  /** Live (non-cancelled) events as stored. */
  events(calendarId: string): GEvent[] {
    return [...this.cal(calendarId).events.values()].filter((s) => s.event.status !== 'cancelled').map((s) => ({ ...s.event }));
  }

  async listCalendars() {
    this.enter('listCalendars', '');
    return [...this.calendars.entries()].map(([id, c]) => ({
      id,
      summary: c.summary,
      ...(c.primary ? { primary: true } : {}),
      accessRole: 'owner',
    }));
  }

  async createCalendar(summary: string, _timeZone: string) {
    this.enter('createCalendar', '');
    const id = `cal-${++this.idCounter}`;
    this.calendars.set(id, { summary, primary: false, events: new Map() });
    return { id };
  }

  async calendarExists(calendarId: string) {
    this.enter('calendarExists', calendarId);
    return this.calendars.has(calendarId);
  }

  async insertEvent(calendarId: string, body: EventBody) {
    this.enter('insertEvent', calendarId);
    const cal = this.cal(calendarId);
    const id = `ev-${++this.idCounter}`;
    const event = this.stamp({ ...body, id, status: 'confirmed' } as GEvent);
    cal.events.set(id, { event, seq: this.seq });
    this.calls[this.calls.length - 1]!.eventId = id;
    return { ...event };
  }

  async patchEvent(calendarId: string, eventId: string, body: EventBody) {
    this.enter('patchEvent', calendarId, eventId);
    const stored = this.mustGet(calendarId, eventId);
    stored.event = this.stamp({ ...stored.event, ...body });
    stored.seq = this.seq;
    return { ...stored.event };
  }

  async deleteEvent(calendarId: string, eventId: string) {
    this.enter('deleteEvent', calendarId, eventId);
    this.tombstone(this.cal(calendarId), eventId);
  }

  async listEvents(calendarId: string, q: ListEventsQuery) {
    this.enter('listEvents', calendarId);
    const cal = this.cal(calendarId);
    let items = [...cal.events.values()];
    if (q.syncToken) {
      const since = Number(q.syncToken.replace('sync-', ''));
      if (!Number.isFinite(since) || since < this.expiredBefore) {
        throw new CalendarApiError(410, 'Sync token is no longer valid', 'fullSyncRequired');
      }
      items = items.filter((s) => s.seq > since);
    } else if (!q.showDeleted) {
      items = items.filter((s) => s.event.status !== 'cancelled');
    }
    let events = items.sort((a, b) => a.seq - b.seq).map((s) => s.event);
    if (!q.syncToken && (q.timeMin || q.timeMax)) {
      const min = q.timeMin ? Date.parse(q.timeMin) : -Infinity;
      const max = q.timeMax ? Date.parse(q.timeMax) : Infinity;
      events = events.filter((e) => {
        const s = Date.parse(e.start?.dateTime ?? e.start?.date ?? '');
        const en = Date.parse(e.end?.dateTime ?? e.end?.date ?? '');
        return s < max && en > min;
      });
    }
    const offset = q.pageToken ? Number(q.pageToken) : 0;
    const page = events.slice(offset, offset + PAGE_SIZE).map((e) => ({ ...e }));
    return offset + PAGE_SIZE < events.length
      ? { items: page, nextPageToken: String(offset + PAGE_SIZE) }
      : { items: page, nextSyncToken: `sync-${this.seq}` };
  }

  private enter(method: keyof CalendarClient, calendarId: string, eventId?: string): void {
    this.calls.push({ method, calendarId, ...(eventId ? { eventId } : {}) });
    const f = this.failures.get(method);
    if (f && f.times > 0) {
      f.times--;
      throw f.error;
    }
    if (calendarId && method !== 'calendarExists' && !this.calendars.has(calendarId)) {
      throw new CalendarApiError(404, 'Not Found', 'notFound');
    }
  }

  private cal(calendarId: string): FakeCal {
    const c = this.calendars.get(calendarId);
    if (!c) throw new CalendarApiError(404, 'Not Found', 'notFound');
    return c;
  }

  private mustGet(calendarId: string, eventId: string): Stored {
    const s = this.cal(calendarId).events.get(eventId);
    if (!s || s.event.status === 'cancelled') throw new CalendarApiError(404, 'Not Found', 'notFound');
    return s;
  }

  private stamp(event: GEvent): GEvent {
    this.seq++;
    return { ...event, updated: this.now, etag: `seq-${this.seq}` };
  }

  private tombstone(cal: FakeCal, eventId: string): void {
    const stored = cal.events.get(eventId);
    if (!stored || stored.event.status === 'cancelled') throw new CalendarApiError(404, 'Not Found', 'notFound');
    stored.event = this.stamp({ ...stored.event, status: 'cancelled' });
    stored.seq = this.seq;
  }
}

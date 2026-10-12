import { calendar } from '@googleapis/calendar';
import type { OAuth2Client } from 'google-auth-library';
import { CalendarApiError, type CalendarClient, type EventBody, type GEvent } from './client.js';

/** Map any googleapis/gaxios failure to a CalendarApiError. */
export function toCalendarApiError(err: unknown): CalendarApiError {
  if (err instanceof CalendarApiError) return err;
  const e = (err ?? {}) as {
    message?: string;
    status?: number;
    response?: { status?: number; data?: any };
  };
  const data = e.response?.data;
  const message = e.message ?? 'Calendar request failed';
  const errField = data?.error;
  const invalidGrant =
    errField === 'invalid_grant' ||
    data?.error_description === 'Token has been expired or revoked.' ||
    /invalid_grant/.test(message);
  if (invalidGrant) return new CalendarApiError(401, message, 'invalid_grant');
  const status = e.response?.status ?? (e.response ? e.status : undefined);
  if (typeof status !== 'number') return new CalendarApiError(0, message, 'network');
  const reason: string | undefined =
    typeof errField === 'object' && errField !== null
      ? (errField.errors?.[0]?.reason ?? errField.status)
      : typeof errField === 'string'
        ? errField
        : undefined;
  return new CalendarApiError(status, message, reason);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toCalendarApiError(err);
  }
}

export function createGoogleCalendarClient(auth: OAuth2Client): CalendarClient {
  const api = calendar({ version: 'v3', auth });
  return {
    listCalendars: () =>
      call(async () => {
        const items: Awaited<ReturnType<CalendarClient['listCalendars']>> = [];
        let pageToken: string | undefined;
        do {
          const res = await api.calendarList.list({ ...(pageToken ? { pageToken } : {}) });
          for (const c of res.data.items ?? []) {
            items.push({
              id: c.id!,
              summary: c.summary ?? c.id!,
              ...(c.primary ? { primary: true } : {}),
              accessRole: c.accessRole ?? 'reader',
            });
          }
          pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
        return items;
      }),
    createCalendar: (summary, timeZone) =>
      call(async () => {
        const res = await api.calendars.insert({ requestBody: { summary, timeZone } });
        return { id: res.data.id! };
      }),
    calendarExists: (calendarId) =>
      call(async () => {
        try {
          await api.calendars.get({ calendarId });
          return true;
        } catch (err) {
          const status = toCalendarApiError(err).status;
          if (status === 404 || status === 410) return false;
          throw err;
        }
      }),
    insertEvent: (calendarId, body: EventBody) =>
      call(async () => (await api.events.insert({ calendarId, requestBody: body })).data as GEvent),
    patchEvent: (calendarId, eventId, body: EventBody) =>
      call(async () => (await api.events.patch({ calendarId, eventId, requestBody: body })).data as GEvent),
    deleteEvent: (calendarId, eventId) =>
      call(async () => {
        await api.events.delete({ calendarId, eventId });
      }),
    listEvents: (calendarId, q) =>
      call(async () => {
        const res = await api.events.list({
          calendarId,
          ...(q.syncToken ? { syncToken: q.syncToken } : {}),
          ...(q.timeMin ? { timeMin: q.timeMin } : {}),
          ...(q.timeMax ? { timeMax: q.timeMax } : {}),
          ...(q.singleEvents !== undefined ? { singleEvents: q.singleEvents } : {}),
          ...(q.pageToken ? { pageToken: q.pageToken } : {}),
          ...(q.showDeleted !== undefined ? { showDeleted: q.showDeleted } : {}),
        });
        return {
          items: (res.data.items ?? []) as GEvent[],
          ...(res.data.nextPageToken ? { nextPageToken: res.data.nextPageToken } : {}),
          ...(res.data.nextSyncToken ? { nextSyncToken: res.data.nextSyncToken } : {}),
        };
      }),
  };
}

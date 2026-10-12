export interface GEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  updated: string;
  etag: string;
  transparency?: 'opaque' | 'transparent';
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

export type EventBody = Pick<GEvent, 'summary' | 'description' | 'colorId' | 'start' | 'end' | 'extendedProperties'>;

export interface ListEventsQuery {
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
  singleEvents?: boolean;
  pageToken?: string;
  showDeleted?: boolean;
}

export interface CalendarClient {
  listCalendars(): Promise<{ id: string; summary: string; primary?: boolean; accessRole: string }[]>;
  createCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
  calendarExists(calendarId: string): Promise<boolean>;
  insertEvent(calendarId: string, body: EventBody): Promise<GEvent>;
  patchEvent(calendarId: string, eventId: string, body: EventBody): Promise<GEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  listEvents(
    calendarId: string,
    q: ListEventsQuery,
  ): Promise<{ items: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>;
}

export class CalendarApiError extends Error {
  constructor(
    readonly status: number,
    message?: string,
    readonly reason?: string,
  ) {
    super(message ?? `Calendar API error ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'CalendarApiError';
  }
}

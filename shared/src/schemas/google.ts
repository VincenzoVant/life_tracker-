import { z } from 'zod';
import type { Block } from './blocks.js';

export const GoogleStatus = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  needsReconnect: z.boolean(),
  calendarId: z.string().nullable(),
  calendarMissing: z.boolean(),
  busyCalendarIds: z.array(z.string()),
  includeAllDay: z.boolean(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  pending: z.number().int(),
  failing: z.number().int(),
  /** Port the server listens on; used to show where to reconnect on the Mac. */
  port: z.number().int(),
});
export type GoogleStatus = z.infer<typeof GoogleStatus>;

export const CalendarListItem = z.object({
  id: z.string(),
  summary: z.string(),
  primary: z.boolean(),
  selected: z.boolean(),
});
export type CalendarListItem = z.infer<typeof CalendarListItem>;

export const BusyCalendarsInput = z.object({
  calendarIds: z.array(z.string().min(1)),
  includeAllDay: z.boolean(),
});
export type BusyCalendarsInput = z.infer<typeof BusyCalendarsInput>;

export const SyncStatus = z.object({
  pending: z.number().int(),
  failing: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      attempts: z.number().int(),
      lastError: z.string().nullable(),
      nextAttemptAt: z.string(),
    }),
  ),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type SyncStatus = z.infer<typeof SyncStatus>;

export const GoogleChange = z.object({
  id: z.number().int(),
  blockId: z.string(),
  kind: z.enum(['moved', 'deleted']),
  title: z.string(),
  beforeStart: z.string(),
  beforeEnd: z.string(),
  afterStart: z.string().nullable(),
  afterEnd: z.string().nullable(),
  createdAt: z.string(),
});
export type GoogleChange = z.infer<typeof GoogleChange>;

export const ChangesSeenInput = z.object({ ids: z.array(z.number().int()) });
export type ChangesSeenInput = z.infer<typeof ChangesSeenInput>;

export type ConflictStatus = 'open' | 'replanned' | 'dismissed';

export interface Conflict {
  id: number;
  calendarId: string;
  externalEventId: string;
  title: string;
  start: string;
  end: string;
  status: ConflictStatus;
  blocks: Block[];
}

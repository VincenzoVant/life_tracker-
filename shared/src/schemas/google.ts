import { z } from 'zod';
import type { Block } from './blocks.js';

export const GoogleStatus = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  needsReconnect: z.boolean(),
});
export type GoogleStatus = z.infer<typeof GoogleStatus>;

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

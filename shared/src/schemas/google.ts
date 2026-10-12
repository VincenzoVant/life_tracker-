import { z } from 'zod';

export const GoogleStatus = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  needsReconnect: z.boolean(),
});
export type GoogleStatus = z.infer<typeof GoogleStatus>;

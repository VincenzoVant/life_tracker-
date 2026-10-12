import { z } from 'zod';
export declare const SettingsInput: z.ZodObject<{
    timezone: z.ZodString;
}, z.core.$strip>;
export type SettingsInput = z.infer<typeof SettingsInput>;

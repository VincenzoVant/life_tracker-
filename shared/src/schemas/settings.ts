import { z } from 'zod';

export const SettingsInput = z.object({
  timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), {
    message: 'Unknown IANA timezone',
  }),
});
export type SettingsInput = z.infer<typeof SettingsInput>;

export const BackupSettingsInput = z.object({
  dir: z
    .string()
    .trim()
    .min(1)
    .refine((d) => d.startsWith('/') || d.startsWith('~/'), {
      message: 'Must be an absolute path or start with ~/',
    }),
});
export type BackupSettingsInput = z.infer<typeof BackupSettingsInput>;

export interface BackupStatus {
  dir: string;
  files: Array<{ name: string; size: number; modifiedAt: string }>;
  lastBackupAt: string | null;
  lastError: string | null;
}

import { z } from 'zod';
export const SettingsInput = z.object({
    timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), {
        message: 'Unknown IANA timezone',
    }),
});

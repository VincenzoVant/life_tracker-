import { Hono } from 'hono';
import { SettingsInput } from '@life-tracker/shared';
import { parse } from '../../lib/validate.js';
import { getTimezone, setSetting } from './service.js';
export function settingsRoutes(ctx) {
    const app = new Hono();
    app.get('/', (c) => c.json({ timezone: getTimezone(ctx) }));
    app.put('/', async (c) => {
        const input = parse(SettingsInput, await c.req.json().catch(() => undefined));
        setSetting(ctx, 'timezone', input.timezone);
        return c.json({ timezone: getTimezone(ctx) });
    });
    return app;
}

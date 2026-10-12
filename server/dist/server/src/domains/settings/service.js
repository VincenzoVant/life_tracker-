import { eq } from 'drizzle-orm';
import { settings } from '../../db/schema.js';
export function getSetting(ctx, key, fallback) {
    const row = ctx.db.select().from(settings).where(eq(settings.key, key)).get();
    return row ? JSON.parse(row.value) : fallback;
}
export function setSetting(ctx, key, value) {
    const json = JSON.stringify(value);
    ctx.db
        .insert(settings)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: settings.key, set: { value: json } })
        .run();
}
export function getTimezone(ctx) {
    return getSetting(ctx, 'timezone', ctx.config.defaultTimezone);
}

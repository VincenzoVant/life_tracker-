import { eq } from 'drizzle-orm';
import type { Ctx } from '../../ctx.js';
import { settings } from '../../db/schema.js';

export function getSetting<T>(ctx: Ctx, key: string, fallback: T): T {
  const row = ctx.db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export function setSetting(ctx: Ctx, key: string, value: unknown): void {
  const json = JSON.stringify(value);
  ctx.db
    .insert(settings)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: settings.key, set: { value: json } })
    .run();
}

export function getTimezone(ctx: Ctx): string {
  return getSetting(ctx, 'timezone', ctx.config.defaultTimezone);
}

import { Hono } from 'hono';
import type { Ctx } from '../../ctx.js';
import { getPreferences, patchPreferences, savePreferences } from './service.js';

export function preferencesRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getPreferences(ctx)));
  app.put('/', async (c) => c.json(savePreferences(ctx, await c.req.json().catch(() => undefined))));
  app.patch('/', async (c) => c.json(patchPreferences(ctx, await c.req.json().catch(() => undefined))));
  return app;
}

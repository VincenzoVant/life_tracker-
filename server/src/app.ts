import { Hono } from 'hono';
import type { ErrorBody } from '@life-tracker/shared';
import type { Ctx } from './ctx.js';
import { AppError } from './lib/errors.js';
import { settingsRoutes } from './domains/settings/routes.js';

export function createApp(ctx: Ctx): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, time: ctx.clock.now().toISOString() }));
  app.route('/api/settings', settingsRoutes(ctx));

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      const body: ErrorBody = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
      return c.json(body, 404);
    }
    return c.text('Not found', 404);
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      const body: ErrorBody = {
        error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
      };
      return c.json(body, err.status);
    }
    console.error(err);
    const body: ErrorBody = { error: { code: 'INTERNAL', message: 'Internal server error' } };
    return c.json(body, 500);
  });

  return app;
}

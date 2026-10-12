import { Hono } from 'hono';
import type { ErrorBody } from '@life-tracker/shared';
import type { Ctx } from './ctx.js';
import { AppError } from './lib/errors.js';
import { authRoutes } from './auth/routes.js';
import { createLockout } from './auth/lockout.js';
import { requireOrigin, requireSession } from './auth/middleware.js';
import { blockRoutes } from './domains/blocks/routes.js';
import { courseRoutes } from './domains/studies/routes.js';
import { startupRoutes } from './domains/startup/routes.js';
import { liftRoutes, workoutRoutes } from './domains/workouts/routes.js';
import { mealLogRoutes, mealRoutes } from './domains/food/routes.js';
import { goalRoutes, progressRoutes } from './domains/goals/routes.js';
import { reviewRoutes } from './domains/review/routes.js';
import { settingsRoutes } from './domains/settings/routes.js';

export function createApp(ctx: Ctx): Hono {
  const app = new Hono();

  app.use('/api/*', requireOrigin(ctx.config));
  app.use('/api/*', requireSession(ctx));

  app.get('/api/health', (c) => c.json({ ok: true, time: ctx.clock.now().toISOString() }));
  app.route('/api/auth', authRoutes(ctx, createLockout(ctx.clock)));
  app.route('/api/settings', settingsRoutes(ctx));
  app.route('/api/blocks', blockRoutes(ctx));
  app.route('/api/courses', courseRoutes(ctx));
  app.route('/api/startup', startupRoutes(ctx));
  app.route('/api/workouts', workoutRoutes(ctx));
  app.route('/api/lifts', liftRoutes(ctx));
  app.route('/api/meals', mealRoutes(ctx));
  app.route('/api/meal-logs', mealLogRoutes(ctx));
  app.route('/api/goals', goalRoutes(ctx));
  app.route('/api/progress', progressRoutes(ctx));
  app.route('/api/review', reviewRoutes(ctx));

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

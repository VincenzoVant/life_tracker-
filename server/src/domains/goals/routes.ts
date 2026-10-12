import { Hono } from 'hono';
import { GoalSet, TrendsQuery, WeekProgressQuery } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { getSetting } from '../settings/service.js';
import { getGoals, saveGoals } from './service.js';
import { getWeekProgress } from './progress.js';
import { getStreaks } from './streaks.js';
import { getTrends } from './trends.js';

export function goalRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getGoals(ctx)));
  app.put('/', async (c) => c.json(saveGoals(ctx, parse(GoalSet, await c.req.json().catch(() => undefined)))));
  return app;
}

export function streakRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getStreaks(ctx)));
  return app;
}

export function progressRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/week', (c) =>
    c.json(
      getWeekProgress(ctx, parse(WeekProgressQuery, c.req.query()).weekStart, {
        classesCountTowardStudy: getSetting(ctx, 'classes_count_toward_study', false),
      }),
    ),
  );
  app.get('/trends', (c) => c.json(getTrends(ctx, parse(TrendsQuery, c.req.query()).weeks as 4 | 12 | 26)));
  return app;
}

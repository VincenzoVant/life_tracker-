import { Hono } from 'hono';
import { GoalSet, WeekProgressQuery } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { getPreferences } from '../preferences/service.js';
import { getGoals, saveGoals } from './service.js';
import { getWeekProgress } from './progress.js';

export function goalRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getGoals(ctx)));
  app.put('/', async (c) => c.json(saveGoals(ctx, parse(GoalSet, await c.req.json().catch(() => undefined)))));
  return app;
}

export function progressRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/week', (c) =>
    c.json(
      (() => {
        const q = parse(WeekProgressQuery, c.req.query());
        return getWeekProgress(ctx, q.weekStart, { prefs: getPreferences(ctx), includeProposed: q.includeProposed });
      })(),
    ),
  );
  return app;
}

import { Hono } from 'hono';
import { GoalSet, WeekProgressQuery } from '@life-tracker/shared';
import { parse } from '../../lib/validate.js';
import { getSetting } from '../settings/service.js';
import { getGoals, saveGoals } from './service.js';
import { getWeekProgress } from './progress.js';
export function goalRoutes(ctx) {
    const app = new Hono();
    app.get('/', (c) => c.json(getGoals(ctx)));
    app.put('/', async (c) => c.json(saveGoals(ctx, parse(GoalSet, await c.req.json().catch(() => undefined)))));
    return app;
}
export function progressRoutes(ctx) {
    const app = new Hono();
    app.get('/week', (c) => c.json(getWeekProgress(ctx, parse(WeekProgressQuery, c.req.query()).weekStart, {
        classesCountTowardStudy: getSetting(ctx, 'classes_count_toward_study', false),
    })));
    return app;
}

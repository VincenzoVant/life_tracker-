import { Hono } from 'hono';
import { ReviewQuery, ReviewSubmission } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { getPendingReview, submitReview } from './service.js';

export function reviewRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(getPendingReview(ctx, parse(ReviewQuery, c.req.query()).date)));
  app.post('/', async (c) =>
    c.json(submitReview(ctx, parse(ReviewSubmission, await c.req.json().catch(() => undefined)))),
  );
  return app;
}

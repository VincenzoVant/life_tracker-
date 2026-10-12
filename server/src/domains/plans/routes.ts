import { Hono } from 'hono';
import { BlockCreateInput, PlanCreateInput, PlanDraftQuery } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { addDraftBlock, commitPlan, createWeekPlan, discardPlan, getDraft } from './service.js';

export function planRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.post('/', async (c) => {
    const { weekStart } = parse(PlanCreateInput, await c.req.json().catch(() => undefined));
    return c.json(createWeekPlan(ctx, weekStart), 201);
  });
  app.get('/draft', (c) => c.json(getDraft(ctx, parse(PlanDraftQuery, c.req.query()).weekStart)));
  app.post('/:id/blocks', async (c) => {
    const input = parse(BlockCreateInput, await c.req.json().catch(() => undefined));
    return c.json(addDraftBlock(ctx, c.req.param('id'), input), 201);
  });
  app.post('/:id/commit', (c) => c.json(commitPlan(ctx, c.req.param('id'))));
  app.post('/:id/discard', (c) => c.json(discardPlan(ctx, c.req.param('id'))));
  return app;
}

import { Hono } from 'hono';
import { MealPlanEntryInput, MealPlanQuery, MealPlanRepeatInput, MealPlanSlotParams } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { clearMealPlanEntry, listMealPlan, repeatLastWeek, setMealPlanEntry } from './service.js';

const body = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => undefined);

export function mealPlanRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(listMealPlan(ctx, parse(MealPlanQuery, c.req.query()).weekStart)));
  app.post('/repeat', async (c) => c.json(repeatLastWeek(ctx, parse(MealPlanRepeatInput, await body(c)).weekStart)));
  app.put('/:date/:slot', async (c) => {
    const p = parse(MealPlanSlotParams, c.req.param());
    return c.json(setMealPlanEntry(ctx, p.date, p.slot, parse(MealPlanEntryInput, await body(c))));
  });
  app.delete('/:date/:slot', (c) => {
    const p = parse(MealPlanSlotParams, c.req.param());
    clearMealPlanEntry(ctx, p.date, p.slot);
    return c.json({ ok: true });
  });
  return app;
}

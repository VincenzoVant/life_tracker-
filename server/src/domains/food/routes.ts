import { Hono } from 'hono';
import { MealInput, MealListQuery, MealLogListQuery, MealUpdateInput, type MealLogInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { archiveMeal, createMeal, deleteMealLog, listMealLogs, listMeals, logMeal, updateMeal } from './service.js';

const body = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => undefined);

export function mealRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(listMeals(ctx, parse(MealListQuery, c.req.query()))));
  app.post('/', async (c) => c.json(createMeal(ctx, parse(MealInput, await body(c))), 201));
  app.patch('/:id', async (c) => c.json(updateMeal(ctx, c.req.param('id'), parse(MealUpdateInput, await body(c)))));
  app.delete('/:id', (c) => c.json(archiveMeal(ctx, c.req.param('id'))));
  return app;
}

export function mealLogRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(listMealLogs(ctx, parse(MealLogListQuery, c.req.query()).date)));
  // logMeal validates with the schema matching the body's shape.
  app.post('/', async (c) => c.json(logMeal(ctx, (await body(c)) as MealLogInput), 201));
  app.delete('/:id', (c) => c.json(deleteMealLog(ctx, c.req.param('id'))));
  return app;
}

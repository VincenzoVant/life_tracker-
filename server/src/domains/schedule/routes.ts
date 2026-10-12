import { Hono } from 'hono';
import { FixedEventUpdateInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { createFixedEvent, deleteFixedEvent, listFixedEvents, updateFixedEvent } from './service.js';

export function scheduleRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json(listFixedEvents(ctx)));
  app.post('/', async (c) => c.json(createFixedEvent(ctx, await c.req.json().catch(() => undefined)), 201));
  app.patch('/:id', async (c) => {
    const patch = parse(FixedEventUpdateInput, await c.req.json().catch(() => undefined));
    return c.json(updateFixedEvent(ctx, c.req.param('id'), patch));
  });
  app.delete('/:id', (c) => {
    deleteFixedEvent(ctx, c.req.param('id'));
    return c.body(null, 204);
  });
  return app;
}

import { Hono } from 'hono';
import {
  MilestoneInput,
  MilestoneUpdateInput,
  TaskInput,
  TaskListQuery,
  TaskReorderInput,
  TaskUpdateInput,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  listMilestones,
  listTasks,
  reorderTasks,
  updateMilestone,
  updateTask,
} from './service.js';

export function startupRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  const body = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => undefined);

  app.get('/tasks', (c) => c.json(listTasks(ctx, parse(TaskListQuery, c.req.query()))));
  app.post('/tasks', async (c) => c.json(createTask(ctx, parse(TaskInput, await body(c))), 201));
  // Registered before /tasks/:id so "reorder" is never read as an id.
  app.post('/tasks/reorder', async (c) => c.json(reorderTasks(ctx, parse(TaskReorderInput, await body(c)).ids)));
  app.patch('/tasks/:id', async (c) => c.json(updateTask(ctx, c.req.param('id'), parse(TaskUpdateInput, await body(c)))));
  app.delete('/tasks/:id', (c) => c.json(deleteTask(ctx, c.req.param('id'))));

  app.get('/milestones', (c) => c.json(listMilestones(ctx)));
  app.post('/milestones', async (c) => c.json(createMilestone(ctx, parse(MilestoneInput, await body(c))), 201));
  app.patch('/milestones/:id', async (c) =>
    c.json(updateMilestone(ctx, c.req.param('id'), parse(MilestoneUpdateInput, await body(c)))),
  );
  app.delete('/milestones/:id', (c) => c.json(deleteMilestone(ctx, c.req.param('id'))));
  return app;
}

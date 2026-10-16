import { Hono } from 'hono';
import { ProjectInput, ProjectListQuery, ProjectUpdateInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { createProject, deleteProject, listProjects, updateProject } from './service.js';

export function projectRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const q = parse(ProjectListQuery, c.req.query());
    return c.json(listProjects(ctx, q.weekStart));
  });
  app.post('/', async (c) => {
    const input = parse(ProjectInput, await c.req.json().catch(() => undefined));
    return c.json(createProject(ctx, input), 201);
  });
  app.patch('/:id', async (c) => {
    const patch = parse(ProjectUpdateInput, await c.req.json().catch(() => undefined));
    return c.json(updateProject(ctx, c.req.param('id'), patch));
  });
  app.delete('/:id', (c) => c.json(deleteProject(ctx, c.req.param('id'))));
  return app;
}

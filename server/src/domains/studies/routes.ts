import { Hono } from 'hono';
import { CourseInput, CourseListQuery, CourseUpdateInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { archiveCourse, createCourse, listCourses, updateCourse } from './service.js';

export function courseRoutes(ctx: Ctx): Hono {
  const app = new Hono();
  app.get('/', (c) => {
    const q = parse(CourseListQuery, c.req.query());
    return c.json(listCourses(ctx, { includeArchived: q.includeArchived === 'true' }));
  });
  app.post('/', async (c) => {
    const input = parse(CourseInput, await c.req.json().catch(() => undefined));
    return c.json(createCourse(ctx, input), 201);
  });
  app.patch('/:id', async (c) => {
    const patch = parse(CourseUpdateInput, await c.req.json().catch(() => undefined));
    return c.json(updateCourse(ctx, c.req.param('id'), patch));
  });
  app.delete('/:id', (c) => c.json(archiveCourse(ctx, c.req.param('id'))));
  return app;
}

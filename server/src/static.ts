import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/** Serves the built web app; any non-/api GET without a matching file gets index.html. */
export function mountStatic(app: Hono, webDist: string): void {
  const root = relative(process.cwd(), webDist) || '.';
  const files = serveStatic({ root });
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return files(c, next);
  });
  app.get('*', (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return c.html(readFileSync(join(webDist, 'index.html'), 'utf8'));
  });
}

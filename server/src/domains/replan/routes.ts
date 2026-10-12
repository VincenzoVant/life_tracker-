import { Hono } from 'hono';
import { QuickAddInput } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { parse } from '../../lib/validate.js';
import { defaultConflictsPort, type ConflictsPort } from './conflictsPort.js';
import { applyReplan, getReplanDraft, keepAsIs, quickAdd, replanFromConflict } from './service.js';

/** Mounted at `/api`; `conflicts` is the Stage 3 module (the controller wires the real one). */
export function replanRoutes(ctx: Ctx, conflicts: ConflictsPort = defaultConflictsPort): Hono {
  const app = new Hono();
  app.post('/quick-add', async (c) => {
    const input = parse(QuickAddInput, await c.req.json().catch(() => undefined));
    return c.json(quickAdd(ctx, input), 201);
  });
  app.get('/replan/:planId', (c) => c.json(getReplanDraft(ctx, c.req.param('planId'))));
  app.post('/replan/:planId/apply', (c) => c.json(applyReplan(ctx, c.req.param('planId'), conflicts)));
  app.post('/replan/:planId/keep', (c) => c.json(keepAsIs(ctx, c.req.param('planId'), conflicts)));
  app.post('/conflicts/:id/replan', (c) => {
    const draft = replanFromConflict(ctx, c.req.param('id'), conflicts);
    return draft ? c.json(draft, 201) : c.json({ draft: null }, 200);
  });
  return app;
}

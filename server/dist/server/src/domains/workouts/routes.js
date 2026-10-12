import { Hono } from 'hono';
import { LiftInput, SessionInput, SessionListQuery, SessionUpdateInput, TopSetInput } from '@life-tracker/shared';
import { parse } from '../../lib/validate.js';
import { addTopSet, createLift, createSession, deleteLift, deleteSession, deleteTopSet, liftHistory, listLiftSummaries, listSessions, renameLift, updateSession, } from './service.js';
const body = (c) => c.req.json().catch(() => undefined);
export function workoutRoutes(ctx) {
    const app = new Hono();
    app.get('/sessions', (c) => c.json(listSessions(ctx, parse(SessionListQuery, c.req.query()))));
    app.post('/sessions', async (c) => c.json(createSession(ctx, parse(SessionInput, await body(c))), 201));
    app.patch('/sessions/:id', async (c) => c.json(updateSession(ctx, c.req.param('id'), parse(SessionUpdateInput, await body(c)))));
    app.delete('/sessions/:id', (c) => c.json(deleteSession(ctx, c.req.param('id'))));
    return app;
}
export function liftRoutes(ctx) {
    const app = new Hono();
    app.get('/', (c) => c.json(listLiftSummaries(ctx)));
    app.post('/', async (c) => c.json(createLift(ctx, parse(LiftInput, await body(c))), 201));
    app.patch('/:id', async (c) => c.json(renameLift(ctx, c.req.param('id'), parse(LiftInput, await body(c)))));
    app.delete('/:id', (c) => c.json(deleteLift(ctx, c.req.param('id'))));
    app.get('/:id/sets', (c) => c.json(liftHistory(ctx, c.req.param('id'))));
    app.post('/:id/sets', async (c) => c.json(addTopSet(ctx, c.req.param('id'), parse(TopSetInput, await body(c))), 201));
    app.delete('/:id/sets/:setId', (c) => c.json(deleteTopSet(ctx, c.req.param('id'), c.req.param('setId'))));
    return app;
}

import { Hono } from 'hono';
import { BlockCreateInput, BlockListQuery, BlockUpdateInput } from '@life-tracker/shared';
import { parse } from '../../lib/validate.js';
import { createBlock, listBlocks, setBlockStatus, updateBlock } from './service.js';
export function blockRoutes(ctx) {
    const app = new Hono();
    app.get('/', (c) => {
        const q = parse(BlockListQuery, c.req.query());
        return c.json(listBlocks(ctx, { from: new Date(q.from), to: new Date(q.to), includeRemoved: q.includeRemoved === 'true' }));
    });
    app.post('/', async (c) => {
        const input = parse(BlockCreateInput, await c.req.json().catch(() => undefined));
        return c.json(createBlock(ctx, input), 201);
    });
    app.patch('/:id', async (c) => {
        const patch = parse(BlockUpdateInput, await c.req.json().catch(() => undefined));
        return c.json(updateBlock(ctx, c.req.param('id'), patch));
    });
    app.delete('/:id', (c) => c.json(setBlockStatus(ctx, c.req.param('id'), 'removed')));
    return app;
}

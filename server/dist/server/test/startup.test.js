import { expect, test } from 'vitest';
import { createBlock, getBlock } from '../src/domains/blocks/service.js';
import { createTestClient } from './helpers.js';
async function mk(c, title, extra = {}) {
    const r = await c.post('/api/startup/tasks', { title, ...extra });
    expect(r.status).toBe(201);
    return r.body;
}
test('new tasks append; reorder persists order', async () => {
    const c = await createTestClient();
    const a = await mk(c, 'a');
    const b = await mk(c, 'b');
    const d = await mk(c, 'c');
    expect((await c.get('/api/startup/tasks')).body.map((t) => t.title)).toEqual(['a', 'b', 'c']);
    expect((await c.post('/api/startup/tasks/reorder', { ids: [d.id, a.id, b.id] })).status).toBe(200);
    expect((await c.get('/api/startup/tasks')).body.map((t) => t.title)).toEqual(['c', 'a', 'b']);
    const e = await mk(c, 'd');
    expect((await c.get('/api/startup/tasks')).body.at(-1).id).toBe(e.id);
});
test('reorder with missing, extra or duplicate id → 400', async () => {
    const c = await createTestClient();
    const a = await mk(c, 'a');
    const b = await mk(c, 'b');
    for (const ids of [[a.id], [a.id, b.id, 'zzz'], [a.id, a.id]]) {
        const res = await c.post('/api/startup/tasks/reorder', { ids });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION');
    }
});
test('status done sets doneAt from clock; back to todo clears it', async () => {
    const c = await createTestClient();
    const t = await mk(c, 'a');
    const done = await c.patch(`/api/startup/tasks/${t.id}`, { status: 'done' });
    expect(done.body).toMatchObject({ status: 'done', doneAt: '2026-10-14T19:00:00.000Z' });
    const back = await c.patch(`/api/startup/tasks/${t.id}`, { status: 'todo' });
    expect(back.body).toMatchObject({ status: 'todo', doneAt: null });
    expect((await c.patch('/api/startup/tasks/nope', { status: 'done' })).status).toBe(404);
});
test('list filters by status; listOpenTasks excludes done', async () => {
    const c = await createTestClient();
    const a = await mk(c, 'a');
    await mk(c, 'b', { status: 'doing' });
    await c.patch(`/api/startup/tasks/${a.id}`, { status: 'done' });
    expect((await c.get('/api/startup/tasks?status=doing')).body.map((t) => t.title)).toEqual(['b']);
    const { listOpenTasks } = await import('../src/domains/startup/service.js');
    expect(listOpenTasks(c.ctx).map((t) => t.title)).toEqual(['b']);
    expect((await c.get('/api/startup/tasks?status=bogus')).status).toBe(400);
});
test('deleting a task linked to a startup block keeps block with startupTaskId null', async () => {
    const c = await createTestClient();
    const t = await mk(c, 'a');
    const block = createBlock(c.ctx, {
        category: 'startup',
        title: 'Work',
        start: '2026-10-15T17:00:00.000Z',
        end: '2026-10-15T18:00:00.000Z',
        startupTaskId: t.id,
    });
    expect(block.startupTaskId).toBe(t.id);
    expect((await c.del(`/api/startup/tasks/${t.id}`)).status).toBe(200);
    expect(getBlock(c.ctx, block.id).startupTaskId).toBeNull();
    expect((await c.get('/api/startup/tasks')).body).toEqual([]);
});
test('block creation rejects an unknown startupTaskId', async () => {
    const c = await createTestClient();
    expect(() => createBlock(c.ctx, {
        category: 'startup',
        title: 'Work',
        start: '2026-10-15T17:00:00.000Z',
        end: '2026-10-15T18:00:00.000Z',
        startupTaskId: 'nope',
    })).toThrow(/Invalid input/);
});
test('deleting milestone detaches its tasks', async () => {
    const c = await createTestClient();
    const m = await c.post('/api/startup/milestones', { title: 'MVP', targetDate: '2026-12-01' });
    expect(m.status).toBe(201);
    expect(m.body).toMatchObject({ title: 'MVP', targetDate: '2026-12-01', doneAt: null });
    const t = await mk(c, 'a', { milestoneId: m.body.id });
    expect(t.milestoneId).toBe(m.body.id);
    expect((await c.del(`/api/startup/milestones/${m.body.id}`)).status).toBe(200);
    expect((await c.get('/api/startup/tasks')).body[0].milestoneId).toBeNull();
    expect((await c.get('/api/startup/milestones')).body).toEqual([]);
});
test('milestone done flag sets/clears doneAt; bad date and unknown milestone rejected', async () => {
    const c = await createTestClient();
    const m = (await c.post('/api/startup/milestones', { title: 'MVP' })).body;
    expect((await c.patch(`/api/startup/milestones/${m.id}`, { done: true })).body.doneAt).toBe('2026-10-14T19:00:00.000Z');
    expect((await c.patch(`/api/startup/milestones/${m.id}`, { done: false })).body.doneAt).toBeNull();
    expect((await c.post('/api/startup/milestones', { title: 'x', targetDate: '12/01' })).status).toBe(400);
    const bad = await c.post('/api/startup/tasks', { title: 'x', milestoneId: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.milestoneId).toBeDefined();
    expect((await c.post('/api/startup/tasks', { title: '' })).status).toBe(400);
});

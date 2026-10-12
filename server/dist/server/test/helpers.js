import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createCtx } from '../src/ctx.js';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { fixedClock } from '../src/lib/clock.js';
import { setSetting } from '../src/domains/settings/service.js';
export function createTestCtx(opts = {}) {
    const handle = openDb(':memory:');
    runMigrations(handle, {});
    const clock = fixedClock(opts.now ?? '2026-10-14T19:00:00.000Z');
    const ctx = { ...createCtx(handle, opts.config ?? loadConfig({ HOME: '/tmp/lt-test' }), clock), clock };
    setSetting(ctx, 'timezone', opts.timezone ?? 'America/Los_Angeles');
    return ctx;
}
export async function request(app, method, path, body, headers = {}) {
    const init = {
        method,
        headers: {
            Origin: 'http://127.0.0.1:4280',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await app.request(path, init);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
}
/** App with PIN 1234 set and a logged-in session; sends the cookie (and Origin) on every call. */
export async function createTestClient(ctx = createTestCtx()) {
    const app = createApp(ctx);
    const setup = await request(app, 'POST', '/api/auth/setup', { pin: '1234' });
    let cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0];
    const call = async (method, path, body) => {
        const res = await request(app, method, path, body, { Cookie: cookie });
        const next = res.headers.get('set-cookie');
        if (next && path === '/api/auth/change-pin')
            cookie = next.split(';')[0];
        return res;
    };
    return {
        ctx,
        app,
        get: (p) => call('GET', p),
        post: (p, b) => call('POST', p, b),
        put: (p, b) => call('PUT', p, b),
        patch: (p, b) => call('PATCH', p, b),
        del: (p) => call('DELETE', p),
    };
}

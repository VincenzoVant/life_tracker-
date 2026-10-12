import type { Hono } from 'hono';
import { type AppConfig } from '../src/config.js';
import { type Ctx } from '../src/ctx.js';
import { fixedClock } from '../src/lib/clock.js';
export declare function createTestCtx(opts?: {
    now?: string;
    timezone?: string;
    config?: AppConfig;
}): Ctx & {
    clock: ReturnType<typeof fixedClock>;
};
export declare function request(app: Hono, method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{
    status: number;
    body: any;
    headers: Headers;
}>;
export interface TestClient {
    ctx: ReturnType<typeof createTestCtx>;
    app: Hono;
    get(path: string): ReturnType<typeof request>;
    post(path: string, body?: unknown): ReturnType<typeof request>;
    put(path: string, body?: unknown): ReturnType<typeof request>;
    patch(path: string, body?: unknown): ReturnType<typeof request>;
    del(path: string): ReturnType<typeof request>;
}
/** App with PIN 1234 set and a logged-in session; sends the cookie (and Origin) on every call. */
export declare function createTestClient(ctx?: ReturnType<typeof createTestCtx>): Promise<TestClient>;

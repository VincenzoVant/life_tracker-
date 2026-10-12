import type { Hono } from 'hono';
/** Serves the built web app; any non-/api GET without a matching file gets index.html. */
export declare function mountStatic(app: Hono, webDist: string): void;

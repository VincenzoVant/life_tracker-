import type { MiddlewareHandler } from 'hono';
import type { AppConfig } from '../config.js';
import type { Ctx } from '../ctx.js';
export declare const SESSION_COOKIE = "lt_session";
/** Secure is set unless the request Host is a loopback host (any port). */
export declare function sessionCookie(token: string, host: string): string;
export declare const clearedCookie: () => string;
export declare function requireOrigin(config: AppConfig): MiddlewareHandler;
export declare function requireSession(ctx: Ctx): MiddlewareHandler;

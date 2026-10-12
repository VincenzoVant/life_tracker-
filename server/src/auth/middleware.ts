import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppConfig } from '../config.js';
import type { Ctx } from '../ctx.js';
import { AppError } from '../lib/errors.js';
import { SESSION_TTL_SECONDS, findSession } from './sessions.js';

export const SESSION_COOKIE = 'lt_session';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0]!;
}

/** Secure is set unless the request Host is a loopback host (any port). */
export function sessionCookie(token: string, host: string): string {
  const secure = LOCAL_HOSTS.has(hostname(host).toLowerCase()) ? '' : '; Secure';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export const clearedCookie = (): string => `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;

export function requireOrigin(config: AppConfig): MiddlewareHandler {
  return async (c, next) => {
    if (MUTATING.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (!origin || !config.allowedOrigins.includes(origin)) {
        throw new AppError('FORBIDDEN_ORIGIN', 'Origin not allowed');
      }
    }
    await next();
  };
}

export function requireSession(ctx: Ctx): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (path === '/api/health' || path.startsWith('/api/auth/')) return next();
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || !findSession(ctx, token)) throw new AppError('UNAUTHORIZED', 'Login required');
    await next();
  };
}

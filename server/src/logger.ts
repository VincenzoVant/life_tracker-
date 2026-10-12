import { join } from 'node:path';
import type { MiddlewareHandler } from 'hono';
import pino from 'pino';

export function createLogger(opts: { dataDir: string; toFile: boolean }): pino.Logger {
  if (!opts.toFile) return pino();
  return pino(
    pino.transport({
      target: 'pino-roll',
      options: {
        file: join(opts.dataDir, 'logs', 'server.log'),
        size: '5m',
        limit: { count: 5 },
        mkdir: true,
      },
    }),
  );
}

/** Logs method, path (no query string), status and duration for /api/*. Never bodies, cookies or queries. */
export function requestLogger(log: pino.Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    try {
      await next();
    } finally {
      log.info(
        { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
        'request',
      );
    }
  };
}

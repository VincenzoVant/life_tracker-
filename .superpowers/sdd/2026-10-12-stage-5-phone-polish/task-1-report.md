# Task 1 report: production config + structured logging

Status: DONE_WITH_CONCERNS

Implemented
- server/src/logger.ts: createLogger (pino-roll transport, size 5m, limit count 5, mkdir; stdout when toFile false) and requestLogger (method, path without query, status, ms; /api/* only).
- config.ts: production allowedOrigins = [127.0.0.1:port, localhost:port, LT_PUBLIC_ORIGIN?]; non-production unchanged.
- auth/middleware.ts: sessionCookie(token, host, forwardedProto?) forces Secure when X-Forwarded-Proto is https; auth/routes.ts passes the header.
- app.ts: createApp(ctx, { log? }) mounts requestLogger on /api/* when log given; onError logs through it.
- index.ts: uses pino logger for startup message and passes it to createApp. createScheduler not in base, so no log passed.
- server/package.json: pino ^10.4.0, pino-roll ^4.0.0 added; tsx moved to dependencies.

Tests
- RED: `npx vitest run logger config auth` failed (logger module missing, production origins incl. 5173, cookie not Secure with forwarded proto).
- GREEN: `npm test` 19 files, 100 tests pass; `npm run typecheck` clean.
- Added server/test/config.test.ts, server/test/logger.test.ts, two cases in auth.test.ts.

Concerns
- pino-roll names files with a numeric index: real smoke run produced logs/server.1.log, not server.log (rotation keeps 5). Brief/constraints say server.log; I did not add pino-roll's `extension`/`dateFormat` tweaks as the brief did not ask.
- Pino transport runs in a worker thread; only the smoke test exercised it, not unit tests (toFile false).
- In main(), startup failures still use console.error (logger may not exist; launchd captures stderr).

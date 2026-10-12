import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { ChangePinInput, LoginInput, SetupInput, type AuthStatus } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { getSetting, setSetting } from '../domains/settings/service.js';
import { AppError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { createLockout } from './lockout.js';
import { SESSION_COOKIE, clearedCookie, sessionCookie } from './middleware.js';
import { hashPin, verifyPin } from './pin.js';
import { createSession, deleteAllSessions, deleteSession, findSession } from './sessions.js';

type Lockout = ReturnType<typeof createLockout>;

export function authRoutes(ctx: Ctx, lockout: Lockout): Hono {
  const app = new Hono();
  const pinHash = (): string | null => getSetting<string | null>(ctx, 'pin_hash', null);
  const authenticated = (c: Context): boolean => {
    const token = getCookie(c, SESSION_COOKIE);
    return !!token && !!findSession(ctx, token);
  };
  const startSession = (c: Context): void => {
    const { token } = createSession(ctx);
    c.header('Set-Cookie', sessionCookie(token, c.req.header('host') ?? ''));
  };
  const body = (c: Context) => c.req.json().catch(() => undefined);

  app.get('/status', (c) => {
    const status: AuthStatus = { pinSet: pinHash() !== null, authenticated: authenticated(c) };
    return c.json(status);
  });

  app.post('/setup', async (c) => {
    const input = parse(SetupInput, await body(c));
    if (pinHash() !== null) throw new AppError('CONFLICT', 'PIN is already set');
    setSetting(ctx, 'pin_hash', await hashPin(input.pin));
    startSession(c);
    return c.json({ pinSet: true, authenticated: true } satisfies AuthStatus);
  });

  app.post('/login', async (c) => {
    const input = parse(LoginInput, await body(c));
    lockout.check();
    const stored = pinHash();
    if (!stored || !(await verifyPin(stored, input.pin))) {
      lockout.recordFailure();
      throw new AppError('UNAUTHORIZED', 'Wrong PIN');
    }
    lockout.reset();
    startSession(c);
    return c.json({ pinSet: true, authenticated: true } satisfies AuthStatus);
  });

  app.post('/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deleteSession(ctx, token);
    c.header('Set-Cookie', clearedCookie());
    return c.json({ pinSet: pinHash() !== null, authenticated: false } satisfies AuthStatus);
  });

  app.post('/change-pin', async (c) => {
    if (!authenticated(c)) throw new AppError('UNAUTHORIZED', 'Login required');
    const input = parse(ChangePinInput, await body(c));
    lockout.check();
    const stored = pinHash();
    if (!stored || !(await verifyPin(stored, input.currentPin))) {
      lockout.recordFailure();
      throw new AppError('UNAUTHORIZED', 'Wrong PIN');
    }
    lockout.reset();
    setSetting(ctx, 'pin_hash', await hashPin(input.newPin));
    deleteAllSessions(ctx);
    startSession(c);
    return c.json({ pinSet: true, authenticated: true } satisfies AuthStatus);
  });

  return app;
}

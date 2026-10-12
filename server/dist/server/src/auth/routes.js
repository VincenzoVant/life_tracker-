import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { ChangePinInput, LoginInput, SetupInput } from '@life-tracker/shared';
import { getSetting, setSetting } from '../domains/settings/service.js';
import { AppError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { SESSION_COOKIE, clearedCookie, sessionCookie } from './middleware.js';
import { hashPin, verifyPin } from './pin.js';
import { createSession, deleteAllSessions, deleteSession, findSession } from './sessions.js';
export function authRoutes(ctx, lockout) {
    const app = new Hono();
    const pinHash = () => getSetting(ctx, 'pin_hash', null);
    const authenticated = (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        return !!token && !!findSession(ctx, token);
    };
    const startSession = (c) => {
        const { token } = createSession(ctx);
        c.header('Set-Cookie', sessionCookie(token, c.req.header('host') ?? ''));
    };
    // Serialize check -> verify -> record so concurrent attempts cannot all pass check()
    // before any failure is recorded, and a late success cannot clear an active lock.
    let chain = Promise.resolve();
    const serialized = (fn) => {
        const run = chain.then(fn, fn);
        chain = run.catch(() => undefined);
        return run;
    };
    const attemptPin = (pin) => serialized(async () => {
        lockout.check();
        const stored = pinHash();
        if (!stored || !(await verifyPin(stored, pin))) {
            lockout.recordFailure();
            throw new AppError('UNAUTHORIZED', 'Wrong PIN');
        }
        lockout.reset();
    });
    const body = (c) => c.req.json().catch(() => undefined);
    app.get('/status', (c) => {
        const status = { pinSet: pinHash() !== null, authenticated: authenticated(c) };
        return c.json(status);
    });
    app.post('/setup', async (c) => {
        const input = parse(SetupInput, await body(c));
        if (pinHash() !== null)
            throw new AppError('CONFLICT', 'PIN is already set');
        setSetting(ctx, 'pin_hash', await hashPin(input.pin));
        startSession(c);
        return c.json({ pinSet: true, authenticated: true });
    });
    app.post('/login', async (c) => {
        const input = parse(LoginInput, await body(c));
        await attemptPin(input.pin);
        startSession(c);
        return c.json({ pinSet: true, authenticated: true });
    });
    app.post('/logout', (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token)
            deleteSession(ctx, token);
        c.header('Set-Cookie', clearedCookie());
        return c.json({ pinSet: pinHash() !== null, authenticated: false });
    });
    app.post('/change-pin', async (c) => {
        if (!authenticated(c))
            throw new AppError('UNAUTHORIZED', 'Login required');
        const input = parse(ChangePinInput, await body(c));
        await attemptPin(input.currentPin);
        setSetting(ctx, 'pin_hash', await hashPin(input.newPin));
        deleteAllSessions(ctx);
        startSession(c);
        return c.json({ pinSet: true, authenticated: true });
    });
    return app;
}

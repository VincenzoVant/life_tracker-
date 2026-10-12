import { Hono } from 'hono';
import type { Ctx } from '../ctx.js';
import type { createLockout } from './lockout.js';
type Lockout = ReturnType<typeof createLockout>;
export declare function authRoutes(ctx: Ctx, lockout: Lockout): Hono;
export {};

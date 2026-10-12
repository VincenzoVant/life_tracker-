import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx.js';
import { sessions } from '../db/schema.js';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function createSession(ctx: Ctx): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('hex');
  const now = ctx.clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  ctx.db
    .insert(sessions)
    .values({
      id: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
    })
    .run();
  return { token, expiresAt };
}

export function findSession(ctx: Ctx, token: string): { id: string } | null {
  const id = hashToken(token);
  const row = ctx.db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return null;
  const now = ctx.clock.now();
  if (new Date(row.expiresAt) <= now) {
    ctx.db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  ctx.db.update(sessions).set({ lastSeenAt: now.toISOString() }).where(eq(sessions.id, id)).run();
  return { id };
}

export function deleteSession(ctx: Ctx, token: string): void {
  ctx.db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function deleteAllSessions(ctx: Ctx): void {
  ctx.db.delete(sessions).run();
}

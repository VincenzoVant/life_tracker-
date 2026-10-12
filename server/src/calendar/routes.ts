import { Hono } from 'hono';
import { desc, inArray } from 'drizzle-orm';
import {
  BusyCalendarsInput,
  ChangesSeenInput,
  type CalendarListItem,
  type GoogleChange,
  type GoogleStatus,
  type SyncStatus,
} from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import { blocks, googleChanges } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { CalendarClient } from './client.js';
import { dismissConflict, listConflicts } from './conflicts.js';
import { queueSummary, runSync } from './runSync.js';
import { ensureCalendarSetup, recreateCalendar } from './setup.js';
import { getCalendarState, updateCalendarState } from './state.js';

function requireClient(ctx: Ctx): CalendarClient {
  const client = ctx.google.client();
  if (!client) throw new AppError('CONFLICT', 'Google is not connected');
  return client;
}

function googleStatus(ctx: Ctx): GoogleStatus {
  const s = getCalendarState(ctx);
  const q = queueSummary(ctx);
  return {
    configured: ctx.google.isConfigured(),
    connected: ctx.google.isConnected(),
    needsReconnect: ctx.google.needsReconnect(),
    calendarId: s.lifeTrackerCalendarId,
    calendarMissing: s.calendarMissing,
    busyCalendarIds: s.busyCalendarIds,
    includeAllDay: s.includeAllDay,
    lastSyncAt: s.lastSyncAt,
    lastError: s.lastError,
    pending: q.pending,
    failing: q.failing.length,
  };
}

function syncStatus(ctx: Ctx): SyncStatus {
  const s = getCalendarState(ctx);
  const q = queueSummary(ctx);
  return { pending: q.pending, failing: q.failing, lastSyncAt: s.lastSyncAt, lastError: s.lastError };
}

async function selectableCalendars(ctx: Ctx): Promise<CalendarListItem[]> {
  const state = getCalendarState(ctx);
  const list = await requireClient(ctx).listCalendars();
  return list
    .filter((c) => c.id !== state.lifeTrackerCalendarId)
    .map((c) => ({ id: c.id, summary: c.summary, primary: c.primary === true, selected: state.busyCalendarIds.includes(c.id) }));
}

export function calendarRoutes(ctx: Ctx): Hono {
  const app = new Hono();

  app.get('/google/status', (c) => c.json(googleStatus(ctx)));

  app.get('/google/connect', async (c) => {
    if (!ctx.google.isConfigured()) {
      throw new AppError('VALIDATION', 'Google client file not found (secrets/google-client.json)');
    }
    const url = await ctx.google.beginAuth(c.req.header('host') ?? new URL(c.req.url).host);
    return c.redirect(url, 302);
  });

  app.get('/google/callback', async (c) => {
    const fail = (message: string) => c.redirect(`/settings?google=error&message=${encodeURIComponent(message)}`, 302);
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (c.req.query('error')) return fail('Google sign-in was cancelled');
    if (!code || !state) return fail('Missing authorization code');
    try {
      await ctx.google.completeAuth(code, state);
      await ensureCalendarSetup(ctx, requireClient(ctx));
      await runSync(ctx);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Google connection failed');
    }
    return c.redirect('/settings?google=connected', 302);
  });

  app.post('/google/disconnect', async (c) => {
    await ctx.google.disconnect();
    return c.json(googleStatus(ctx));
  });

  app.get('/google/calendars', async (c) => c.json(await selectableCalendars(ctx)));

  app.put('/google/busy-calendars', async (c) => {
    const input = parse(BusyCalendarsInput, await c.req.json().catch(() => undefined));
    const known = new Set((await selectableCalendars(ctx)).map((x) => x.id));
    const unknown = input.calendarIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new AppError('VALIDATION', 'Invalid input', { calendarIds: `Unknown calendar: ${unknown.join(', ')}` });
    }
    updateCalendarState(ctx, { busyCalendarIds: [...new Set(input.calendarIds)], includeAllDay: input.includeAllDay });
    return c.json(googleStatus(ctx));
  });

  app.post('/google/recreate-calendar', async (c) => {
    await recreateCalendar(ctx, requireClient(ctx));
    return c.json(googleStatus(ctx));
  });

  app.get('/google/changes', (c) => {
    const unseenOnly = c.req.query('unseen') === 'true';
    const rows = ctx.db.select().from(googleChanges).orderBy(desc(googleChanges.id)).all().filter((r) => !unseenOnly || !r.seen);
    const titles = new Map(
      ctx.db
        .select({ id: blocks.id, title: blocks.title })
        .from(blocks)
        .where(inArray(blocks.id, rows.map((r) => r.blockId)))
        .all()
        .map((b) => [b.id, b.title]),
    );
    const out: GoogleChange[] = rows.map((r) => ({
      id: r.id,
      blockId: r.blockId,
      kind: r.kind as 'moved' | 'deleted',
      title: titles.get(r.blockId) ?? '',
      beforeStart: r.beforeStart ?? '',
      beforeEnd: r.beforeEnd ?? '',
      afterStart: r.afterStart,
      afterEnd: r.afterEnd,
      createdAt: r.createdAt,
    }));
    return c.json(out);
  });

  app.post('/google/changes/seen', async (c) => {
    const { ids } = parse(ChangesSeenInput, await c.req.json().catch(() => undefined));
    if (ids.length > 0) ctx.db.update(googleChanges).set({ seen: true }).where(inArray(googleChanges.id, ids)).run();
    return c.json({ ok: true });
  });

  app.get('/sync/status', (c) => c.json(syncStatus(ctx)));

  app.post('/sync/now', async (c) => {
    await runSync(ctx);
    return c.json(syncStatus(ctx));
  });

  app.get('/conflicts', (c) => {
    const status = c.req.query('status') ?? 'open';
    if (status !== 'open') throw new AppError('VALIDATION', 'Invalid input', { status: 'Only status=open is supported' });
    return c.json(listConflicts(ctx, 'open'));
  });

  app.post('/conflicts/:id/dismiss', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) throw new AppError('NOT_FOUND', 'Conflict not found');
    return c.json(dismissConflict(ctx, id));
  });

  return app;
}

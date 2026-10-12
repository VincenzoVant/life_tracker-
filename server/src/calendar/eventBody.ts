import { createHash } from 'node:crypto';
import { CATEGORY_META, type Block } from '@life-tracker/shared';
import type { Ctx } from '../ctx.js';
import type { EventBody } from './client.js';

export type SyncOp = 'create' | 'update' | 'delete';

const PAST_GRACE_MS = 24 * 3_600_000;
const MIRRORED = new Set(['committed', 'done', 'partial', 'skipped']);

export function appOrigin(ctx: Ctx): string {
  return ctx.config.publicOrigin ?? `http://127.0.0.1:${ctx.config.port}`;
}

/** Mirrored when not an unplanned review block and committed or reviewed. */
export function shouldMirror(b: Block): boolean {
  return b.source !== 'unplanned' && MIRRORED.has(b.status);
}

export function toGoogleEvent(b: Block, opts: { tz: string; appOrigin: string }): EventBody {
  return {
    summary: b.title,
    description: `Life Tracker · ${opts.appOrigin}/week?block=${b.id}`,
    colorId: CATEGORY_META[b.category].gcalColorId,
    start: { dateTime: b.start, timeZone: opts.tz },
    end: { dateTime: b.end, timeZone: opts.tz },
    extendedProperties: { private: { lifeTrackerBlockId: b.id } },
  };
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

export function eventHash(body: EventBody): string {
  return createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
}

/** Single source of truth for what the queue should do with a block. */
export function deriveOp(b: Block, now: Date): SyncOp | null {
  if (b.status === 'removed') return b.gcalEventId ? 'delete' : null;
  if (!shouldMirror(b)) return null;
  if (b.gcalEventId) return 'update';
  // Don't back-fill long-past blocks (e.g. reviewed after the calendar was recreated).
  return new Date(b.end).getTime() < now.getTime() - PAST_GRACE_MS ? null : 'create';
}

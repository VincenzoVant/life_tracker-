import { dismissConflict, listConflicts, markConflictReplanned } from '../../calendar/conflicts.js';
import type { Ctx } from '../../ctx.js';
import { notFound } from '../../lib/errors.js';

/** Only the slice of `Conflict` the replan flow needs. */
export interface ConflictRef {
  id: string;
  title: string;
  start: string;
  end: string;
  status: 'open' | 'replanned' | 'dismissed';
}

export interface ConflictsPort {
  listConflicts(ctx: Ctx, status: 'open'): ConflictRef[];
  dismissConflict(ctx: Ctx, id: string): unknown;
  markConflictReplanned(ctx: Ctx, id: string): unknown;
}

function numericId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n)) throw notFound('Conflict');
  return n;
}

/** Adapter over the Stage 3 conflicts module (numeric ids there, string ids in the replan flow). */
export const defaultConflictsPort: ConflictsPort = {
  listConflicts: (ctx, status) =>
    listConflicts(ctx, status).map((c) => ({ id: String(c.id), title: c.title, start: c.start, end: c.end, status: c.status })),
  dismissConflict: (ctx, id) => dismissConflict(ctx, numericId(id)),
  markConflictReplanned: (ctx, id) => markConflictReplanned(ctx, numericId(id)),
};

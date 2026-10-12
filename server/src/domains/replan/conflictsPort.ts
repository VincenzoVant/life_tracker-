import type { Ctx } from '../../ctx.js';

/**
 * TODO: replace with the Stage 3 module (server/src/calendar/conflicts.ts) at merge.
 * Only the slice of `Conflict` the replan flow needs.
 */
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

const unavailable = (): never => {
  throw new Error('conflicts module not available');
};

/** Default until the controller wires the real calendar/conflicts module. */
export const defaultConflictsPort: ConflictsPort = {
  listConflicts: unavailable,
  dismissConflict: unavailable,
  markConflictReplanned: unavailable,
};

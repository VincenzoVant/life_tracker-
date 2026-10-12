import { eq } from 'drizzle-orm';
import {
  ReviewSubmission,
  addDays,
  blockMinutes,
  dayRangeUtc,
  isoWeekday,
  type PendingReview,
  type ReviewResult,
  type WorkoutDetails,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { blocks, dailyReviews, workoutSessions } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { createBlock, getBlock, listBlocks, setBlockStatus } from '../blocks/service.js';
import { getWeekProgress } from '../goals/progress.js';
import { getSetting, getTimezone } from '../settings/service.js';
import { updateTask } from '../startup/service.js';
import { deleteSessionForBlock, upsertSessionForBlock } from '../workouts/service.js';

const REVIEWED = new Set(['done', 'partial', 'skipped']);

export function getPendingReview(ctx: Ctx, date: string): PendingReview {
  const { start, end } = dayRangeUtc(date, getTimezone(ctx));
  // A block belongs to the local date its start falls on, so only blocks starting before the day's end count.
  const all = listBlocks(ctx, { from: new Date(0), to: end }).filter((b) => new Date(b.start) < end);
  const pending = all.filter((b) => b.status === 'committed');
  const reviewed = all.filter((b) => REVIEWED.has(b.status) && new Date(b.start) >= start);
  const row = ctx.db.select().from(dailyReviews).where(eq(dailyReviews.date, date)).get();
  return { date, pending, reviewed, completedAt: row?.completedAt ?? null };
}

function checkMinutes(
  fields: Record<string, string>,
  key: string,
  minutes: number | undefined,
  max: number,
  required: boolean,
): void {
  if (minutes === undefined) {
    if (required) fields[key] = 'Minutes are required';
    return;
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > max) fields[key] = `Must be a whole number between 1 and ${max}`;
}

/** Details already stored for a block's session, so a re-review without a workout payload keeps them. */
function existingDetails(ctx: Ctx, blockId: string): WorkoutDetails {
  const row = ctx.db.select().from(workoutSessions).where(eq(workoutSessions.blockId, blockId)).get();
  if (!row) return {};
  return {
    ...(row.intensity != null && { intensity: row.intensity }),
    ...(row.notes != null && { notes: row.notes }),
    ...(row.gymFocus != null && { gymFocus: row.gymFocus }),
    ...(row.cardioKind != null && { cardioKind: row.cardioKind }),
    ...(row.distanceKm != null && { distanceKm: row.distanceKm }),
    ...(row.sportName != null && { sportName: row.sportName }),
  } as WorkoutDetails;
}

export function submitReview(ctx: Ctx, input: ReviewSubmission): ReviewResult {
  const s = parse(ReviewSubmission, input);
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  s.entries.forEach((e, i) => {
    if (seen.has(e.blockId)) fields[`entries.${i}.blockId`] = 'Block appears more than once';
    seen.add(e.blockId);
    if (e.outcome !== 'partial') return;
    const row = ctx.db.select({ start: blocks.start, end: blocks.end }).from(blocks).where(eq(blocks.id, e.blockId)).get();
    // Unknown blocks are reported as NOT_FOUND by the transaction below.
    if (row) checkMinutes(fields, `entries.${i}.actualMinutes`, e.actualMinutes, blockMinutes(row), true);
  });
  s.unplanned.forEach((u, i) => checkMinutes(fields, `unplanned.${i}.actualMinutes`, u.actualMinutes, blockMinutes(u), false));
  if (Object.keys(fields).length > 0) throw new AppError('VALIDATION', 'Invalid input', fields);

  ctx.sqlite.transaction((): void => {
    for (const e of s.entries) {
      const block = getBlock(ctx, e.blockId);
      const minutes = e.outcome === 'done' ? blockMinutes(block) : e.outcome === 'partial' ? e.actualMinutes! : 0;
      const updated = setBlockStatus(ctx, block.id, e.outcome, minutes);
      if (block.category === 'workout') {
        if (e.outcome === 'skipped') deleteSessionForBlock(ctx, block.id);
        else upsertSessionForBlock(ctx, updated, minutes, e.workout ?? existingDetails(ctx, block.id));
      }
      if (e.completeStartupTask && e.outcome !== 'skipped' && block.startupTaskId) {
        updateTask(ctx, block.startupTaskId, { status: 'done' });
      }
    }
    for (const u of s.unplanned) {
      const { actualMinutes, workout, ...blockInput } = u;
      const duration = blockMinutes(blockInput);
      const minutes = actualMinutes ?? duration;
      const block = createBlock(ctx, blockInput, {
        source: 'unplanned',
        status: minutes < duration ? 'partial' : 'done',
        actualMinutes: minutes,
      });
      if (block.category === 'workout') upsertSessionForBlock(ctx, block, minutes, workout ?? {});
    }
    const now = ctx.clock.now().toISOString();
    ctx.db
      .insert(dailyReviews)
      .values({ date: s.date, completedAt: now })
      .onConflictDoUpdate({ target: dailyReviews.date, set: { completedAt: now } })
      .run();
  })();

  return {
    date: s.date,
    progress: getWeekProgress(ctx, addDays(s.date, 1 - isoWeekday(s.date)), {
      classesCountTowardStudy: getSetting(ctx, 'classes_count_toward_study', false),
    }),
  };
}

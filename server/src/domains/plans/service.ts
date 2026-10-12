import { and, asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { ApiShortfall, Block, BlockCreateInput, Plan, PlanDraft, PlanSummary } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { blocks, plans } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { planWeek } from '../../planner/index.js';
import type { Shortfall } from '../../planner/types.js';
import { createBlock, deleteProposedBlocks, listBlocks, setBlockStatus } from '../blocks/service.js';
import { buildPlannerInput } from './inputs.js';

type Row = typeof plans.$inferSelect;

export const toPlan = (r: Row): Plan => ({
  id: r.id,
  weekStart: r.weekStart,
  mode: r.mode as Plan['mode'],
  triggerBlockId: r.triggerBlockId,
  status: r.status as Plan['status'],
  createdAt: r.createdAt,
  summary: r.summary as PlanSummary,
});

export function toApiShortfall(s: Shortfall): ApiShortfall {
  const g = s.goal;
  switch (g.kind) {
    case 'study':
      return { kind: 'study', courseId: g.courseId, courseName: g.courseName, missing: s.missing, unit: 'minutes' };
    case 'startup':
      return { kind: 'startup', missing: s.missing, unit: 'minutes' };
    case 'workout':
      return { kind: 'workout', workoutType: g.workoutType, missing: s.missing, unit: 'count' };
    case 'free_evenings':
      return { kind: 'free_evenings', missing: s.missing, unit: 'count' };
  }
}

export function getPlanRow(ctx: Ctx, id: string): Row {
  const row = ctx.db.select().from(plans).where(eq(plans.id, id)).get();
  if (!row) throw notFound('Plan');
  return row;
}

function proposedBlocks(ctx: Ctx, planId: string): Block[] {
  return ctx.db
    .select()
    .from(blocks)
    .where(and(eq(blocks.planId, planId), eq(blocks.status, 'proposed')))
    .orderBy(asc(blocks.start), asc(blocks.id))
    .all() as Block[];
}

function requireDraft(ctx: Ctx, id: string): Row {
  const row = getPlanRow(ctx, id);
  if (row.mode !== 'full') throw notFound('Plan');
  if (row.status !== 'draft') throw new AppError('CONFLICT', `Plan is already ${row.status}`);
  return row;
}

function discardRow(ctx: Ctx, id: string): void {
  deleteProposedBlocks(ctx, proposedBlocks(ctx, id).map((b) => b.id));
  ctx.db.update(plans).set({ status: 'discarded' }).where(eq(plans.id, id)).run();
}

export function createWeekPlan(ctx: Ctx, weekStart: string): PlanDraft {
  const input = buildPlannerInput(ctx, weekStart);
  const out = planWeek(input);
  const id = ulid();
  ctx.db.transaction(() => {
    const olds = ctx.db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.weekStart, weekStart), eq(plans.status, 'draft'), eq(plans.mode, 'full')))
      .all();
    for (const old of olds) discardRow(ctx, old.id);
    const summary: PlanSummary = { shortfalls: out.shortfalls.map(toApiShortfall), reservedEvenings: out.reservedEvenings };
    ctx.db
      .insert(plans)
      .values({ id, weekStart, mode: 'full', triggerBlockId: null, status: 'draft', summary, createdAt: ctx.clock.now().toISOString() })
      .run();
    for (const p of out.blocks) {
      createBlock(
        ctx,
        {
          category: p.category,
          title: p.title,
          start: new Date(p.start).toISOString(),
          end: new Date(p.end).toISOString(),
          courseId: p.courseId,
          startupTaskId: p.startupTaskId,
          workoutType: p.workoutType,
          mealSlot: p.mealSlot,
        },
        { status: 'proposed', source: 'planner', planId: id },
      );
    }
  });
  return { plan: toPlan(getPlanRow(ctx, id)), blocks: proposedBlocks(ctx, id) };
}

export function getDraft(ctx: Ctx, weekStart: string): PlanDraft | null {
  const row = ctx.db
    .select()
    .from(plans)
    .where(and(eq(plans.weekStart, weekStart), eq(plans.status, 'draft'), eq(plans.mode, 'full')))
    .orderBy(desc(plans.createdAt), desc(plans.id))
    .get();
  return row ? { plan: toPlan(row), blocks: proposedBlocks(ctx, row.id) } : null;
}

export function addDraftBlock(ctx: Ctx, planId: string, input: BlockCreateInput): Block {
  requireDraft(ctx, planId);
  return createBlock(ctx, input, { status: 'proposed', source: 'manual', planId });
}

const LIVE_STATUSES = new Set(['committed', 'done', 'partial', 'skipped']);

/** Commits a full-week draft, dropping proposed blocks that are now in the past or collide with newer commitments. */
export function commitPlan(ctx: Ctx, planId: string): Plan & { skipped: number } {
  const row = requireDraft(ctx, planId);
  let skipped = 0;
  ctx.db.transaction(() => {
    const now = ctx.clock.now().getTime();
    const proposed = proposedBlocks(ctx, planId);
    const from = new Date(Math.min(...proposed.map((b) => new Date(b.start).getTime()), now));
    const to = new Date(Math.max(...proposed.map((b) => new Date(b.end).getTime()), now));
    const live = proposed.length
      ? listBlocks(ctx, { from, to })
          .filter((b) => LIVE_STATUSES.has(b.status))
          .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
      : [];
    const busy = proposed.length
      ? ctx.busy.busyIntervals(from, to).map((i) => ({ start: new Date(i.start).getTime(), end: new Date(i.end).getTime() }))
      : [];
    const obstacles = [...live, ...busy];
    const drop: string[] = [];
    for (const b of proposed) {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      if (s < now || obstacles.some((o) => o.start < e && o.end > s)) drop.push(b.id);
      else setBlockStatus(ctx, b.id, 'committed');
    }
    skipped = drop.length;
    deleteProposedBlocks(ctx, drop);
    ctx.db.update(plans).set({ status: 'applied' }).where(eq(plans.id, row.id)).run();
  });
  return { ...toPlan(getPlanRow(ctx, planId)), skipped };
}

export function discardPlan(ctx: Ctx, planId: string): Plan {
  requireDraft(ctx, planId);
  ctx.db.transaction(() => discardRow(ctx, planId));
  return toPlan(getPlanRow(ctx, planId));
}

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type {
  ApiPlanChange, Block, Plan, PlanSummary, QuickAddInput, QuickAddResult, ReplanDraft,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { plans } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { replan, type PlanChangeCore } from '../../planner/replan.js';
import type { Interval } from '../../planner/types.js';
import { createBlock, getBlock, setBlockStatus, updateBlock } from '../blocks/service.js';
import { getPreferences } from '../preferences/service.js';
import { getPlanRow, toApiShortfall, toPlan } from '../plans/service.js';
import { getTimezone } from '../settings/service.js';
import { defaultConflictsPort, type ConflictsPort } from './conflictsPort.js';
import { buildReplanInput, type Basis, type Trigger } from './inputs.js';
import { resolveQuickAddWhen } from './presets.js';

export const STALE_MESSAGE = 'Your week changed since this replan — please replan again';

const iso = (ms: number): string => new Date(ms).toISOString();
const span = (i: Interval): { start: string; end: string } => ({ start: iso(i.start), end: iso(i.end) });

function replanRow(ctx: Ctx, id: string) {
  const row = getPlanRow(ctx, id);
  if (row.mode !== 'replan') throw notFound('Replan');
  return row;
}

function requireReplanDraft(ctx: Ctx, id: string) {
  const row = replanRow(ctx, id);
  if (row.status !== 'draft') throw new AppError('CONFLICT', `Plan is already ${row.status}`);
  return row;
}

function toDraft(plan: Plan): ReplanDraft {
  return { plan, changes: plan.summary.changes ?? [], shortfalls: plan.summary.shortfalls };
}

export function createReplanDraft(
  ctx: Ctx,
  opts: { trigger: Trigger; triggerBlockId?: string; conflictId?: string },
): ReplanDraft | null {
  const { input, weekStart, basis } = buildReplanInput(ctx, opts.trigger);
  const out = replan(input);
  if (out.changes.length === 0) return null;

  const byId = new Map(input.movable.map((m) => [m.id, m]));
  const changes: ApiPlanChange[] = out.changes.map((c: PlanChangeCore) => {
    if (c.type === 'added') {
      const b = c.block;
      return {
        type: 'added', blockId: null, title: b.title, category: b.category, from: null, to: span(b),
        ...(b.courseId ? { courseId: b.courseId } : {}),
        ...(b.startupTaskId ? { startupTaskId: b.startupTaskId } : {}),
        ...(b.workoutType ? { workoutType: b.workoutType } : {}),
        ...(b.mealSlot ? { mealSlot: b.mealSlot } : {}),
      };
    }
    const m = byId.get(c.blockId)!;
    return {
      type: c.type, blockId: c.blockId, title: m.title, category: m.category,
      from: span(c.from), to: c.type === 'removed' ? null : span(c.to),
    };
  });

  const summary: PlanSummary = {
    shortfalls: out.shortfalls.map(toApiShortfall),
    reservedEvenings: [],
    changes,
    ...(opts.conflictId ? { conflictId: opts.conflictId } : {}),
  };
  const id = ulid();
  ctx.db.transaction(() => {
    ctx.db
      .update(plans)
      .set({ status: 'discarded' })
      .where(and(eq(plans.weekStart, weekStart), eq(plans.mode, 'replan'), eq(plans.status, 'draft')))
      .run();
    ctx.db
      .insert(plans)
      .values({
        id, weekStart, mode: 'replan', triggerBlockId: opts.triggerBlockId ?? null, status: 'draft',
        summary, basisJson: JSON.stringify(basis), createdAt: ctx.clock.now().toISOString(),
      })
      .run();
  });
  return toDraft(toPlan(getPlanRow(ctx, id)));
}

export function quickAdd(ctx: Ctx, input: QuickAddInput): QuickAddResult {
  const now = ctx.clock.now();
  const { start, end } = resolveQuickAddWhen(input.when, now, getPreferences(ctx), getTimezone(ctx));
  let block!: Block;
  let draft: ReplanDraft | null = null;
  ctx.db.transaction(() => {
    block = createBlock(
      ctx,
      {
        category: input.category,
        title: input.title,
        start: start.toISOString(),
        end: end.toISOString(),
        notes: input.notes,
      },
      { source: 'quick_add', status: 'committed', locked: true },
    );
    draft = createReplanDraft(ctx, { trigger: { start, end, title: block.title }, triggerBlockId: block.id });
  });
  return { block, draft };
}

export function getReplanDraft(ctx: Ctx, planId: string): ReplanDraft {
  return toDraft(toPlan(replanRow(ctx, planId)));
}

export function applyReplan(ctx: Ctx, planId: string, conflicts: ConflictsPort = defaultConflictsPort): { plan: Plan; blocks: Block[] } {
  const row = requireReplanDraft(ctx, planId);
  const summary = row.summary as PlanSummary;
  const basis = JSON.parse(row.basisJson ?? '{}') as Basis;
  const touched: Block[] = [];

  ctx.db.transaction(() => {
    for (const [id, was] of Object.entries(basis)) {
      let cur: Block;
      try {
        cur = getBlock(ctx, id);
      } catch {
        throw new AppError('CONFLICT', STALE_MESSAGE);
      }
      if (cur.updatedAt !== was.updatedAt || cur.status !== was.status) throw new AppError('CONFLICT', STALE_MESSAGE);
    }
    for (const c of summary.changes ?? []) {
      if (c.type === 'added') {
        touched.push(
          createBlock(
            ctx,
            {
              category: c.category, title: c.title, start: c.to!.start, end: c.to!.end,
              courseId: c.courseId, startupTaskId: c.startupTaskId, workoutType: c.workoutType, mealSlot: c.mealSlot,
            },
            { source: 'planner', status: 'committed', planId },
          ),
        );
      } else if (c.type === 'removed') {
        touched.push(setBlockStatus(ctx, c.blockId!, 'removed'));
      } else {
        touched.push(updateBlock(ctx, c.blockId!, { start: c.to!.start, end: c.to!.end }));
      }
    }
    ctx.db.update(plans).set({ status: 'applied' }).where(eq(plans.id, planId)).run();
    if (summary.conflictId) conflicts.markConflictReplanned(ctx, summary.conflictId);
  });
  return { plan: toPlan(getPlanRow(ctx, planId)), blocks: touched };
}

export function keepAsIs(ctx: Ctx, planId: string, conflicts: ConflictsPort = defaultConflictsPort): Plan {
  const row = requireReplanDraft(ctx, planId);
  const conflictId = (row.summary as PlanSummary).conflictId;
  ctx.db.transaction(() => {
    ctx.db.update(plans).set({ status: 'discarded' }).where(eq(plans.id, planId)).run();
    if (conflictId) conflicts.dismissConflict(ctx, conflictId);
  });
  return toPlan(getPlanRow(ctx, planId));
}

export function replanFromConflict(
  ctx: Ctx,
  conflictId: string,
  conflicts: ConflictsPort = defaultConflictsPort,
): ReplanDraft | null {
  const conflict = conflicts.listConflicts(ctx, 'open').find((c) => c.id === conflictId);
  if (!conflict) throw new AppError('CONFLICT', 'This conflict is no longer open');
  return createReplanDraft(ctx, {
    trigger: { start: new Date(conflict.start), end: new Date(conflict.end), title: conflict.title },
    conflictId,
  });
}

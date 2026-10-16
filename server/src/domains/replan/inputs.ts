import {
  type Category, weekDates, weekRangeUtc, weekStartOf, type Block, type BlockStatus,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { ceilTo15 } from '../../planner/intervals.js';
import type { MovableBlock, ReplanInput } from '../../planner/replan.js';
import type { Pads, PlannerBlockRef, PlannerGoal } from '../../planner/types.js';
import { listBlocks } from '../blocks/service.js';
import { getGoals } from '../goals/service.js';
import { freePastEvenings } from '../plans/inputs.js';
import { padsLookup } from '../plans/pads.js';
import { getPreferences } from '../preferences/service.js';
import { getTimezone } from '../settings/service.js';
import { listOpenTasks } from '../startup/service.js';

export interface Trigger {
  start: Date;
  end: Date;
  title: string;
}

export type Basis = Record<string, { updatedAt: string; status: BlockStatus }>;

const FROZEN_STATUSES = new Set<BlockStatus>(['committed', 'done', 'partial', 'skipped']);
/** Manually entered life events: replan works around them and never touches them. */
const FROZEN_MANUAL_CATEGORIES = new Set<Category>(['appointment', 'social', 'errand', 'work', 'other']);
const ms = (iso: string): number => new Date(iso).getTime();

const toRef = (b: Block, pads: (b: Block) => Pads): PlannerBlockRef => ({
  ...pads(b),
  start: ms(b.start),
  end: ms(b.end),
  category: b.category,
  source: b.source,
  courseId: b.courseId,
  workoutType: b.workoutType,
  mealSlot: b.mealSlot,
});

const toMovable = (b: Block): MovableBlock => ({
  id: b.id,
  start: ms(b.start),
  end: ms(b.end),
  category: b.category,
  title: b.title,
  courseId: b.courseId,
  startupTaskId: b.startupTaskId,
  projectId: b.projectId ?? null,
  workoutType: b.workoutType,
  mealSlot: b.mealSlot,
});

export function buildReplanInput(
  ctx: Ctx,
  trigger: Trigger,
): { input: ReplanInput; weekStart: string; basis: Basis } {
  const tz = getTimezone(ctx);
  const prefs = getPreferences(ctx);
  const weekStart = weekStartOf(trigger.start, tz);
  const week = weekRangeUtc(weekStart, tz);
  const now = ctx.clock.now().getTime();
  const range = { start: Math.max(ceilTo15(now), week.start.getTime()), end: week.end.getTime() };

  const weekBlocks = listBlocks(ctx, { from: week.start, to: week.end }).filter((b) => {
    const s = ms(b.start);
    return s >= week.start.getTime() && s < week.end.getTime();
  });
  const inRange =
    range.start < range.end ? listBlocks(ctx, { from: new Date(range.start), to: new Date(range.end) }) : [];

  const frozen: Block[] = [];
  const movable: Block[] = [];
  for (const b of inRange) {
    if (!FROZEN_STATUSES.has(b.status)) continue; // proposed blocks of a full-week draft are neither
    const isMovable = b.status === 'committed' && !b.locked && b.source !== 'fixed' &&
      !(b.source === 'manual' && FROZEN_MANUAL_CATEGORIES.has(b.category)) && ms(b.start) >= range.start;
    (isMovable ? movable : frozen).push(b);
  }

  const goalSet = getGoals(ctx);
  const goals: PlannerGoal[] = [];
  if (goalSet.freeEvenings !== null) {
    const isCurrent = week.start.getTime() <= now;
    const past = isCurrent ? freePastEvenings(weekDates(weekStart), weekBlocks, prefs, tz, now) : 0;
    const count = Math.max(0, goalSet.freeEvenings - past);
    if (count > 0) goals.push({ kind: 'free_evenings', count });
  }

  const basis: Basis = {};
  for (const b of movable) basis[b.id] = { updatedAt: b.updatedAt, status: b.status };
  // Locked blocks in range are obstacles the draft was placed around; changing one makes the draft stale.
  for (const b of frozen) if (b.locked) basis[b.id] = { updatedAt: b.updatedAt, status: b.status };

  const pads = padsLookup(ctx, prefs);
  const input: ReplanInput = {
    range,
    timezone: tz,
    prefs,
    existing: frozen.map((b) => toRef(b, pads)),
    busy: ctx.busy
      .busyIntervals(new Date(range.start), new Date(range.end))
      .map((i) => ({ start: ms(i.start), end: ms(i.end), title: i.title })),
    goals,
    startupTasks: listOpenTasks(ctx).map((t) => ({ id: t.id, title: t.title })),
    movable: movable.map(toMovable),
    trigger: { start: trigger.start.getTime(), end: trigger.end.getTime(), title: trigger.title },
  };
  return { input, weekStart, basis };
}

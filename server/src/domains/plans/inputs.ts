import {
  WORKOUT_TYPES,
  blockMinutes,
  eveningWindowUtc,
  weekDates,
  weekRangeUtc,
  type Block,
  type Preferences,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { AppError } from '../../lib/errors.js';
import { ceilTo15 } from '../../planner/intervals.js';
import type { PlannerBlockRef, PlannerGoal, PlannerInput } from '../../planner/types.js';
import { listBlocks } from '../blocks/service.js';
import { getGoals } from '../goals/service.js';
import { getPreferences } from '../preferences/service.js';
import { getTimezone } from '../settings/service.js';
import { listOpenTasks } from '../startup/service.js';
import { listCourses } from '../studies/service.js';

const EXISTING_STATUSES = new Set(['committed', 'done', 'partial', 'skipped']);

const ms = (iso: string): number => new Date(iso).getTime();

/** Minutes already spent (done/partial) or committed and still unreviewed. */
function usedMinutes(bs: Block[]): number {
  let total = 0;
  for (const b of bs) {
    if (b.status === 'done' || b.status === 'partial') total += b.actualMinutes ?? 0;
    else if (b.status === 'committed') total += blockMinutes(b);
  }
  return total;
}

function toRef(b: Block): PlannerBlockRef {
  return {
    start: ms(b.start),
    end: ms(b.end),
    category: b.category,
    source: b.source,
    courseId: b.courseId,
    workoutType: b.workoutType,
    mealSlot: b.mealSlot,
  };
}

/** Evenings that already ended with no study/startup/work in them. */
export function freePastEvenings(dates: string[], weekBlocks: Block[], prefs: Preferences, tz: string, now: number): number {
  const busy = weekBlocks.filter(
    (b) =>
      ['study', 'startup', 'work'].includes(b.category) &&
      (b.status === 'committed' || b.status === 'done' || b.status === 'partial'),
  );
  let free = 0;
  for (const d of dates) {
    const w = eveningWindowUtc(d, prefs, tz);
    if (w.end.getTime() > now) continue;
    if (!busy.some((b) => ms(b.start) < w.end.getTime() && ms(b.end) > w.start.getTime())) free += 1;
  }
  return free;
}

export function buildPlannerInput(ctx: Ctx, weekStart: string): PlannerInput {
  const tz = getTimezone(ctx);
  const prefs = getPreferences(ctx);
  const week = weekRangeUtc(weekStart, tz);
  const now = ctx.clock.now().getTime();
  if (week.end.getTime() <= now) {
    throw new AppError('VALIDATION', 'Invalid input', { weekStart: 'Cannot plan a past week' });
  }
  const isCurrent = week.start.getTime() <= now;
  const range = { start: isCurrent ? ceilTo15(now) : week.start.getTime(), end: week.end.getTime() };

  const weekBlocks = listBlocks(ctx, { from: week.start, to: week.end }).filter((b) => {
    const s = ms(b.start);
    return s >= week.start.getTime() && s < week.end.getTime();
  });
  const inRange = listBlocks(ctx, { from: new Date(range.start), to: new Date(range.end) }).filter((b) =>
    EXISTING_STATUSES.has(b.status),
  );
  // Gym blocks just outside the range still constrain gym spacing (minHoursBetweenGym).
  const gymMargin = prefs.minHoursBetweenGym * 3_600_000;
  const inRangeIds = new Set(inRange.map((b) => b.id));
  const nearbyGyms = listBlocks(ctx, { from: new Date(range.start - gymMargin), to: new Date(range.end + gymMargin) }).filter(
    (b) =>
      !inRangeIds.has(b.id) &&
      EXISTING_STATUSES.has(b.status) &&
      b.category === 'workout' &&
      b.workoutType === 'gym',
  );
  const existing = [...inRange, ...nearbyGyms].map(toRef);
  const busy = ctx.busy
    .busyIntervals(new Date(range.start), new Date(range.end))
    .map((i) => ({ start: ms(i.start), end: ms(i.end), title: i.title }));

  const goalSet = getGoals(ctx);
  const goals: PlannerGoal[] = [];

  const studyBlocks = weekBlocks.filter(
    (b) => b.category === 'study' && b.courseId !== null && (prefs.classesCountTowardStudy || b.source !== 'fixed'),
  );
  for (const c of listCourses(ctx)) {
    const minutes = Math.max(0, c.weeklyGoalMinutes - usedMinutes(studyBlocks.filter((b) => b.courseId === c.id)));
    if (minutes > 0) goals.push({ kind: 'study', courseId: c.id, courseName: c.name, minutes });
  }

  if (goalSet.startupMinutes !== null) {
    const used = usedMinutes(weekBlocks.filter((b) => b.category === 'startup'));
    const minutes = Math.max(0, goalSet.startupMinutes - used);
    if (minutes > 0) goals.push({ kind: 'startup', minutes });
  }

  const workoutBlocks = weekBlocks.filter((b) => b.category === 'workout');
  for (const t of WORKOUT_TYPES) {
    const goal = goalSet.workoutsByType[t];
    if (goal === null || goal === undefined) continue;
    const have = workoutBlocks.filter(
      (b) => b.workoutType === t && (b.status === 'done' || b.status === 'partial' || b.status === 'committed'),
    ).length;
    const count = Math.max(0, goal - have);
    if (count > 0) goals.push({ kind: 'workout', workoutType: t, count });
  }

  if (goalSet.freeEvenings !== null) {
    const past = isCurrent ? freePastEvenings(weekDates(weekStart), weekBlocks, prefs, tz, now) : 0;
    const count = Math.max(0, goalSet.freeEvenings - past);
    if (count > 0) goals.push({ kind: 'free_evenings', count });
  }

  return {
    range,
    timezone: tz,
    prefs,
    existing,
    busy,
    goals,
    startupTasks: listOpenTasks(ctx).map((t) => ({ id: t.id, title: t.title })),
  };
}

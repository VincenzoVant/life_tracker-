import {
  EVENING_START_DEFAULT,
  SLEEP_START_DEFAULT,
  WORKOUT_TYPES,
  blockMinutes,
  eveningWindowUtc,
  localDateOf,
  weekDates,
  weekRangeUtc,
  type Block,
  type Metric,
  type Preferences,
  type WeekProgress,
  type WorkoutType,
} from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { listBlocks } from '../blocks/service.js';
import { dailyTotals } from '../food/service.js';
import { getTimezone } from '../settings/service.js';
import { listCourses } from '../studies/service.js';
import { listSessions } from '../workouts/service.js';
import { getGoals } from './service.js';

export interface WeekProgressOpts {
  prefs?: Preferences;
  includeProposed?: boolean;
}

const PLANNED_STATUSES = new Set(['committed', 'done', 'partial', 'skipped']);
const PLANNED_WITH_PROPOSED = new Set([...PLANNED_STATUSES, 'proposed']);
const ACTUAL_STATUSES = new Set(['done', 'partial']);
const BUSY_STATUSES = new Set(['committed', 'done', 'partial']);
const BUSY_CATEGORIES = new Set(['study', 'startup', 'work']);

/** The free-evening window of one local date; without preferences it falls back to the Stage 1 defaults. */
function eveningWindow(date: string, tz: string, prefs?: Preferences): { start: Date; end: Date } {
  return eveningWindowUtc(
    date,
    prefs ?? {
      sleep: { start: SLEEP_START_DEFAULT, end: '07:30' },
      earliestBlock: '08:00',
      latestBlockEnd: '22:30',
      eveningStart: EVENING_START_DEFAULT,
    },
    tz,
  );
}

const plannedMinutes = (bs: Block[], statuses: Set<string> = PLANNED_STATUSES): number =>
  bs.filter((b) => statuses.has(b.status) && b.source !== 'unplanned').reduce((s, b) => s + blockMinutes(b), 0);
const actualMinutes = (bs: Block[]): number =>
  bs.filter((b) => ACTUAL_STATUSES.has(b.status)).reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
const plannedCount = (bs: Block[], statuses: Set<string> = PLANNED_STATUSES): number =>
  bs.filter((b) => statuses.has(b.status) && b.source !== 'unplanned').length;
const actualCount = (bs: Block[]): number => bs.filter((b) => ACTUAL_STATUSES.has(b.status)).length;

export function getWeekProgress(ctx: Ctx, weekStart: string, opts: WeekProgressOpts = {}): WeekProgress {
  const tz = getTimezone(ctx);
  const planned = opts.includeProposed ? PLANNED_WITH_PROPOSED : PLANNED_STATUSES;
  const goals = getGoals(ctx);
  const dates = weekDates(weekStart);
  const range = weekRangeUtc(weekStart, tz);
  const today = localDateOf(ctx.clock.now(), tz);

  const all = listBlocks(ctx, { from: range.start, to: range.end });
  // A block belongs to the local date its start falls on.
  const inWeek = all.filter((b) => {
    const s = new Date(b.start).getTime();
    return s >= range.start.getTime() && s < range.end.getTime();
  });
  const ofCategory = (c: string) => inWeek.filter((b) => b.category === c);

  // Study, split per course.
  const studyBlocks = ofCategory('study').filter(
    (b) => b.courseId !== null && (opts.prefs?.classesCountTowardStudy === true || b.source !== 'fixed'),
  );
  const withBlocks = new Set(studyBlocks.map((b) => b.courseId));
  const courses = listCourses(ctx, { includeArchived: true }).filter((c) => c.active || withBlocks.has(c.id));
  const study = courses.map((c) => {
    const bs = studyBlocks.filter((b) => b.courseId === c.id);
    return {
      courseId: c.id,
      name: c.name,
      color: c.color,
      goal: c.weeklyGoalMinutes > 0 ? c.weeklyGoalMinutes : null,
      planned: plannedMinutes(bs, planned),
      actual: actualMinutes(bs),
    };
  });

  const startupBlocks = ofCategory('startup');
  const startup: Metric = {
    goal: goals.startupMinutes,
    planned: plannedMinutes(startupBlocks, planned),
    actual: actualMinutes(startupBlocks),
  };
  const workBlocks = ofCategory('work');
  const work = { planned: plannedMinutes(workBlocks, planned), actual: actualMinutes(workBlocks) };

  // Workouts: block counts plus standalone sessions (no block) in the week.
  const workoutBlocks = ofCategory('workout');
  const standalone = listSessions(ctx, { from: dates[0]!, to: dates[6]! }).filter((s) => s.blockId === null);
  const metricFor = (type: WorkoutType | null, goal: number | null): Metric => {
    const bs = type ? workoutBlocks.filter((b) => b.workoutType === type) : workoutBlocks;
    const extra = standalone.filter((s) => type === null || s.type === type).length;
    return { goal, planned: plannedCount(bs, planned), actual: actualCount(bs) + extra };
  };
  const byType = {} as Record<WorkoutType, Metric>;
  for (const t of WORKOUT_TYPES) byType[t] = metricFor(t, goals.workoutsByType[t]);

  // Free evenings: nothing study/startup/work overlaps the evening window.
  const busy = all.filter((b) => BUSY_CATEGORIES.has(b.category) && BUSY_STATUSES.has(b.status));
  const freeAll = dates.filter((d) => {
    const w = eveningWindow(d, tz, opts.prefs);
    return !busy.some((b) => new Date(b.start) < w.end && new Date(b.end) > w.start);
  });
  const freeDates = freeAll.filter((d) => d <= today);

  // Nutrition.
  const totals = dailyTotals(ctx, dates);
  const kcalGoal = goals.dailyKcal;
  const nutrition = dates.map((date) => {
    const t = totals[date]!;
    const past = date <= today;
    return {
      date,
      kcal: t.kcal,
      proteinG: t.proteinG,
      kcalTarget: kcalGoal?.target ?? null,
      proteinTarget: goals.dailyProteinG,
      kcalOk: kcalGoal && past ? Math.abs(t.kcal - kcalGoal.target) <= (kcalGoal.target * kcalGoal.tolerancePct) / 100 : null,
      proteinOk: goals.dailyProteinG !== null && past ? t.proteinG >= goals.dailyProteinG : null,
    };
  });

  return {
    weekStart,
    study,
    startup,
    work,
    workouts: { total: metricFor(null, goals.workoutsTotal), byType },
    freeEvenings: { goal: goals.freeEvenings, planned: freeAll.length, actual: freeDates.length, freeDates },
    nutrition,
  };
}

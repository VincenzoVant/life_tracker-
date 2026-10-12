import { EVENING_START_DEFAULT, SLEEP_START_DEFAULT, WORKOUT_TYPES, blockMinutes, localDateOf, weekDates, weekRangeUtc, zonedToUtc, } from '@life-tracker/shared';
import { listBlocks } from '../blocks/service.js';
import { dailyTotals } from '../food/service.js';
import { getTimezone } from '../settings/service.js';
import { listCourses } from '../studies/service.js';
import { listSessions } from '../workouts/service.js';
import { getGoals } from './service.js';
const PLANNED_STATUSES = new Set(['committed', 'done', 'partial', 'skipped']);
const ACTUAL_STATUSES = new Set(['done', 'partial']);
const BUSY_STATUSES = new Set(['committed', 'done', 'partial']);
const BUSY_CATEGORIES = new Set(['study', 'startup', 'work']);
/** The free-evening window of one local date: [evening start, sleep start). Kept in one place so Stage 2 can swap in preferences. */
function eveningWindow(date, tz, opts) {
    return {
        start: zonedToUtc(date, opts.eveningStart ?? EVENING_START_DEFAULT, tz),
        end: zonedToUtc(date, opts.sleepStart ?? SLEEP_START_DEFAULT, tz),
    };
}
const plannedMinutes = (bs) => bs.filter((b) => PLANNED_STATUSES.has(b.status) && b.source !== 'unplanned').reduce((s, b) => s + blockMinutes(b), 0);
const actualMinutes = (bs) => bs.filter((b) => ACTUAL_STATUSES.has(b.status)).reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
const plannedCount = (bs) => bs.filter((b) => PLANNED_STATUSES.has(b.status) && b.source !== 'unplanned').length;
const actualCount = (bs) => bs.filter((b) => ACTUAL_STATUSES.has(b.status)).length;
export function getWeekProgress(ctx, weekStart, opts = {}) {
    const tz = getTimezone(ctx);
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
    const ofCategory = (c) => inWeek.filter((b) => b.category === c);
    // Study, split per course.
    const studyBlocks = ofCategory('study').filter((b) => b.courseId !== null && (opts.classesCountTowardStudy === true || b.source !== 'fixed'));
    const withBlocks = new Set(studyBlocks.map((b) => b.courseId));
    const courses = listCourses(ctx, { includeArchived: true }).filter((c) => c.active || withBlocks.has(c.id));
    const study = courses.map((c) => {
        const bs = studyBlocks.filter((b) => b.courseId === c.id);
        return {
            courseId: c.id,
            name: c.name,
            color: c.color,
            goal: c.weeklyGoalMinutes > 0 ? c.weeklyGoalMinutes : null,
            planned: plannedMinutes(bs),
            actual: actualMinutes(bs),
        };
    });
    const startupBlocks = ofCategory('startup');
    const startup = {
        goal: goals.startupMinutes,
        planned: plannedMinutes(startupBlocks),
        actual: actualMinutes(startupBlocks),
    };
    const workBlocks = ofCategory('work');
    const work = { planned: plannedMinutes(workBlocks), actual: actualMinutes(workBlocks) };
    // Workouts: block counts plus standalone sessions (no block) in the week.
    const workoutBlocks = ofCategory('workout');
    const standalone = listSessions(ctx, { from: dates[0], to: dates[6] }).filter((s) => s.blockId === null);
    const metricFor = (type, goal) => {
        const bs = type ? workoutBlocks.filter((b) => b.workoutType === type) : workoutBlocks;
        const extra = standalone.filter((s) => type === null || s.type === type).length;
        return { goal, planned: plannedCount(bs), actual: actualCount(bs) + extra };
    };
    const byType = {};
    for (const t of WORKOUT_TYPES)
        byType[t] = metricFor(t, goals.workoutsByType[t]);
    // Free evenings: nothing study/startup/work overlaps the evening window.
    const busy = all.filter((b) => BUSY_CATEGORIES.has(b.category) && BUSY_STATUSES.has(b.status));
    const freeAll = dates.filter((d) => {
        const w = eveningWindow(d, tz, opts);
        return !busy.some((b) => new Date(b.start) < w.end && new Date(b.end) > w.start);
    });
    const freeDates = freeAll.filter((d) => d <= today);
    // Nutrition.
    const totals = dailyTotals(ctx, dates);
    const kcalGoal = goals.dailyKcal;
    const nutrition = dates.map((date) => {
        const t = totals[date];
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

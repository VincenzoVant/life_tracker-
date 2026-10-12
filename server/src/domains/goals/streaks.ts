import { addDays, localDateOf, weekStartOf, type Streaks } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { dailyReviews } from '../../db/schema.js';
import { getTimezone } from '../settings/service.js';
import { getGoals } from './service.js';
import { progressForWeek } from './trends.js';

const MAX_WEEKS_BACK = 520;

function reviewDays(ctx: Ctx, today: string): number {
  const dates = new Set(ctx.db.select({ date: dailyReviews.date }).from(dailyReviews).all().map((r) => r.date));
  // Not having reviewed today yet must not reset the streak.
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function workoutWeeks(ctx: Ctx, currentWeek: string): number {
  const g = getGoals(ctx);
  const set = [g.workoutsTotal, g.workoutsByType.gym, g.workoutsByType.cardio, g.workoutsByType.sport];
  // A goal of 0 is no goal: it is always met and would walk the whole look-back window.
  if (set.every((x) => !x)) return 0;
  const met = (weekStart: string): boolean => {
    const w = progressForWeek(ctx, weekStart).workouts;
    return [w.total, w.byType.gym, w.byType.cardio, w.byType.sport].every((m) => !m.goal || m.actual >= m.goal);
  };
  let week = met(currentWeek) ? currentWeek : addDays(currentWeek, -7);
  let n = 0;
  while (n < MAX_WEEKS_BACK && met(week)) {
    n++;
    week = addDays(week, -7);
  }
  return n;
}

export function getStreaks(ctx: Ctx): Streaks {
  const tz = getTimezone(ctx);
  return {
    reviewDays: reviewDays(ctx, localDateOf(ctx.clock.now(), tz)),
    workoutWeeks: workoutWeeks(ctx, weekStartOf(ctx.clock.now(), tz)),
  };
}

import { addDays, localDateOf, weekStartOf, type WeekProgress, type WeekTrend } from '@life-tracker/shared';
import type { Ctx } from '../../ctx.js';
import { getPreferences } from '../preferences/service.js';
import { getTimezone } from '../settings/service.js';
import { getWeekProgress } from './progress.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function progressForWeek(ctx: Ctx, weekStart: string): WeekProgress {
  return getWeekProgress(ctx, weekStart, { prefs: getPreferences(ctx) });
}

function toWeekTrend(p: WeekProgress, today: string): WeekTrend {
  const goals = p.study.map((c) => c.goal).filter((g): g is number => g !== null);
  // A day counts as logged when it is not in the future and has any logged calories or protein.
  const logged = p.nutrition.filter((n) => n.date <= today && (n.kcal > 0 || n.proteinG > 0));
  const avg = (f: (n: (typeof logged)[number]) => number): number | null =>
    logged.length === 0 ? null : round1(logged.reduce((s, n) => s + f(n), 0) / logged.length);
  return {
    weekStart: p.weekStart,
    studyMinutes: {
      goal: goals.length === 0 ? null : goals.reduce((a, b) => a + b, 0),
      actual: p.study.reduce((s, c) => s + c.actual, 0),
    },
    startupMinutes: { goal: p.startup.goal, actual: p.startup.actual },
    workMinutes: { actual: p.work.actual },
    workouts: { goal: p.workouts.total.goal, actual: p.workouts.total.actual },
    freeEvenings: { goal: p.freeEvenings.goal, actual: p.freeEvenings.actual },
    avgKcal: avg((n) => n.kcal),
    avgProteinG: avg((n) => n.proteinG),
    daysKcalOk: p.nutrition.filter((n) => n.kcalOk === true).length,
    daysProteinOk: p.nutrition.filter((n) => n.proteinOk === true).length,
  };
}

/** Oldest first, ending with the current week. */
export function getTrends(ctx: Ctx, weeks: 4 | 12 | 26): WeekTrend[] {
  const tz = getTimezone(ctx);
  const today = localDateOf(ctx.clock.now(), tz);
  const current = weekStartOf(ctx.clock.now(), tz);
  const out: WeekTrend[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push(toWeekTrend(progressForWeek(ctx, addDays(current, -7 * i)), today));
  return out;
}

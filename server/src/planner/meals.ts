import { PLANNED_MEALS, addDays, isoWeekday, localDateOf, mealTimesFor, zonedToUtc, type MealSlot, type PlannedMeal } from '@life-tracker/shared';
import { MINUTE_MS } from './intervals.js';
import type { Timeline } from './timeline.js';
import type { Interval, PlannerInput, ProposedBlock } from './types.js';

const TITLES: Record<PlannedMeal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

/** Candidate nearest to `target`; ties go to the earlier start. */
function nearest(cands: Interval[], target: number): Interval | null {
  let best: Interval | null = null;
  for (const c of cands) {
    if (!best || Math.abs(c.start - target) < Math.abs(best.start - target)) best = c;
  }
  return best;
}

export function placeMeals(
  t: Timeline,
  input: PlannerInput,
  opts: { onlySlots?: Array<{ date: string; slot: MealSlot }> } = {},
): ProposedBlock[] {
  const { prefs, timezone: tz } = input;
  const flex = prefs.mealFlexMinutes * MINUTE_MS;
  const out: ProposedBlock[] = [];
  for (const day of t.days) {
    const times = mealTimesFor(prefs, isoWeekday(day.date));
    for (const slot of PLANNED_MEALS) {
      if (opts.onlySlots && !opts.onlySlots.some((s) => s.date === day.date && s.slot === slot)) continue;
      const cfg = times[slot];
      if (!cfg) continue;
      const already = input.existing.some(
        (e) => e.category === 'meal' && e.mealSlot === slot && localDateOf(new Date(e.start), tz) === day.date,
      );
      if (already) continue;
      const target = zonedToUtc(day.date, cfg.time, tz).getTime();
      const cands = t.candidates(day.date, cfg.minutes, {
        within: { start: target - flex, end: target + flex + cfg.minutes * MINUTE_MS },
      });
      const best = nearest(cands, target);
      if (!best) continue;
      const block: ProposedBlock = { category: 'meal', title: TITLES[slot], mealSlot: slot, start: best.start, end: best.end };
      t.occupy(block);
      out.push(block);
    }
  }
  return out;
}

export function placeMealPrep(t: Timeline, input: PlannerInput): ProposedBlock[] {
  const { prefs, timezone: tz, range } = input;
  const inRange = input.existing.some((e) => e.category === 'meal_prep' && e.start >= range.start && e.start < range.end);
  if (inRange || t.days.length === 0) return [];

  const first = t.days[0]!.date;
  const weekStart = addDays(first, 1 - isoWeekday(first));
  const ref = addDays(weekStart, prefs.mealPrep.day - 1);
  const dayNumber = (d: string) => Math.round(new Date(`${d}T12:00:00Z`).getTime() / 86_400_000);
  const order = [...t.days].sort((a, b) => {
    const da = Math.abs(dayNumber(a.date) - dayNumber(ref));
    const db = Math.abs(dayNumber(b.date) - dayNumber(ref));
    return da - db || dayNumber(a.date) - dayNumber(b.date);
  });

  const minutes = prefs.mealPrep.minutes;
  for (const day of order) {
    if (t.load(day.date).planned + minutes > prefs.maxPlannedMinutesPerDay) continue;
    const target = zonedToUtc(day.date, prefs.mealPrep.preferredStart, tz).getTime();
    const best = nearest(t.candidates(day.date, minutes), target);
    if (!best) continue;
    const block: ProposedBlock = { category: 'meal_prep', title: 'Meal prep', start: best.start, end: best.end };
    t.occupy(block);
    return [block];
  }
  return [];
}

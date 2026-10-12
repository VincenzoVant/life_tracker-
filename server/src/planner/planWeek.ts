import { placeStartup, placeStudy } from './chunked.js';
import { reserveEvenings } from './evenings.js';
import { placeMealPrep, placeMeals } from './meals.js';
import { createTimeline } from './timeline.js';
import type { PlannerInput, PlannerOutput, ProposedBlock, Shortfall } from './types.js';
import { placeWorkouts } from './workouts.js';

const CATEGORY_ORDER: Record<string, number> = { meal: 0, meal_prep: 1, workout: 2, study: 3, startup: 4 };

function compareBlocks(a: ProposedBlock, b: ProposedBlock): number {
  return (
    a.start - b.start ||
    (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) ||
    (a.courseId ?? '').localeCompare(b.courseId ?? '') ||
    (a.workoutType ?? '').localeCompare(b.workoutType ?? '') ||
    a.end - b.end
  );
}

/** Pure and deterministic: places meals, meal prep, free evenings, workouts, study, then startup work. */
export function planWeek(input: PlannerInput): PlannerOutput {
  const t = createTimeline(input);
  const meals = placeMeals(t, input);
  const prep = placeMealPrep(t, input);
  const evenings = reserveEvenings(t, input);
  const workouts = placeWorkouts(t, input);
  const study = placeStudy(t, input, evenings.reservedIntervals);
  const startup = placeStartup(t, input, evenings.reservedIntervals);

  const all: Shortfall[] = [
    ...(evenings.shortfall ? [evenings.shortfall] : []),
    ...workouts.shortfalls,
    ...study.shortfalls,
    ...startup.shortfalls,
  ];
  const order = new Map(input.goals.map((g, i) => [g, i]));
  const shortfalls = all.sort((a, b) => (order.get(a.goal) ?? 0) - (order.get(b.goal) ?? 0));

  const blocks = [...meals, ...prep, ...workouts.blocks, ...study.blocks, ...startup.blocks].sort(compareBlocks);
  return { blocks, shortfalls, reservedEvenings: evenings.reserved };
}

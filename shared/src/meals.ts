import type { MealCfg, Preferences } from './schemas/preferences.js';

export const PLANNED_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type PlannedMeal = (typeof PLANNED_MEALS)[number];
/** The meals planned on one day; null means that meal is skipped. */
export type DayMeals = Record<PlannedMeal, MealCfg | null>;

/** Meal times for an ISO weekday (1 = Monday): the last `mealsByDay` entry covering it, else the default `meals`. */
export function mealTimesFor(prefs: Pick<Preferences, 'meals' | 'mealsByDay'>, weekday: number): DayMeals {
  let src: DayMeals = prefs.meals;
  for (const o of prefs.mealsByDay ?? []) if ((o.days as number[]).includes(weekday)) src = o;
  return { breakfast: src.breakfast, lunch: src.lunch, dinner: src.dinner };
}

import { expect, test } from 'vitest';
import { DEFAULT_PREFERENCES, mealTimesFor, type Preferences } from '../src/index.js';

const brunch = { time: '10:30', minutes: 45 };
const prefs = (mealsByDay: Preferences['mealsByDay']) => ({ meals: DEFAULT_PREFERENCES.meals, mealsByDay });

test('no overrides → default meals every day', () => {
  for (let d = 1; d <= 7; d++) expect(mealTimesFor(prefs([]), d)).toEqual(DEFAULT_PREFERENCES.meals);
});

test('override applies on its days only; null skips a meal', () => {
  const p = prefs([{ days: [6, 7], breakfast: null, lunch: brunch, dinner: DEFAULT_PREFERENCES.meals.dinner }]);
  expect(mealTimesFor(p, 6)).toEqual({ breakfast: null, lunch: brunch, dinner: DEFAULT_PREFERENCES.meals.dinner });
  expect(mealTimesFor(p, 7).breakfast).toBeNull();
  expect(mealTimesFor(p, 5)).toEqual(DEFAULT_PREFERENCES.meals);
});

test('later entries win when days overlap', () => {
  const late = { time: '21:00', minutes: 30 };
  const p = prefs([
    { days: [5, 6], breakfast: null, lunch: null, dinner: null },
    { days: [6], breakfast: brunch, lunch: null, dinner: late },
  ]);
  expect(mealTimesFor(p, 5)).toEqual({ breakfast: null, lunch: null, dinner: null });
  expect(mealTimesFor(p, 6)).toEqual({ breakfast: brunch, lunch: null, dinner: late });
});

test('missing mealsByDay (old stored preferences) falls back to defaults', () => {
  expect(mealTimesFor({ meals: DEFAULT_PREFERENCES.meals } as Preferences, 3)).toEqual(DEFAULT_PREFERENCES.meals);
});

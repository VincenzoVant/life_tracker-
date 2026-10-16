import { localDateOf } from '@life-tracker/shared';
import { describe, expect, test } from 'vitest';
import { placeMealPrep, placeMeals } from '../../src/planner/meals.js';
import { createTimeline } from '../../src/planner/timeline.js';
import { TZ, at, baseInput, prefs, ref } from './fixtures.js';

const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';
const SAT = '2026-10-24';
const SUN = '2026-10-25';

function run(over = {}) {
  const input = baseInput(over);
  const t = createTimeline(input);
  return { input, t, blocks: placeMeals(t, input) };
}

test('empty next week → 21 meals at exact preferred times', () => {
  const { blocks } = run();
  expect(blocks).toHaveLength(21);
  expect(blocks.every((b) => b.category === 'meal' && b.mealSlot)).toBe(true);
  const find = (date: string, slot: string) => blocks.find((b) => localDateOf(new Date(b.start), TZ) === date && b.mealSlot === slot)!;
  expect(find(MON, 'lunch')).toMatchObject({ title: 'Lunch', start: at(MON, '12:30'), end: at(MON, '13:00') });
  expect(find(MON, 'dinner')).toMatchObject({ title: 'Dinner', start: at(MON, '19:00'), end: at(MON, '19:45') });
  expect(find(MON, 'breakfast')).toMatchObject({ title: 'Breakfast', start: at(MON, '08:00'), end: at(MON, '08:20') });
});
test('busy 12:00-13:00 Tue moves lunch to 13:15-13:45 (nearest within flex)', () => {
  const { blocks } = run({ busy: [{ start: at(TUE, '12:00'), end: at(TUE, '13:00'), title: 'x' }] });
  const lunch = blocks.find((b) => b.mealSlot === 'lunch' && localDateOf(new Date(b.start), TZ) === TUE)!;
  expect(lunch.start).toBe(at(TUE, '13:15'));
  expect(lunch.end).toBe(at(TUE, '13:45'));
});
test('no slot within flex → meal skipped, no shortfall', () => {
  const { blocks } = run({ busy: [{ start: at(TUE, '11:00'), end: at(TUE, '14:30'), title: 'x' }] });
  expect(blocks.some((b) => b.mealSlot === 'lunch' && localDateOf(new Date(b.start), TZ) === TUE)).toBe(false);
  expect(blocks).toHaveLength(20);
});
test('existing lunch block on Wed → no proposed Wed lunch', () => {
  const { blocks } = run({ existing: [ref(WED, '12:30', '13:00', { category: 'meal', mealSlot: 'lunch' })] });
  expect(blocks.some((b) => b.mealSlot === 'lunch' && localDateOf(new Date(b.start), TZ) === WED)).toBe(false);
  expect(blocks).toHaveLength(20);
});
test('meals placed in the same pass respect buffers between them', () => {
  const { blocks } = run({ prefs: prefs({ meals: { ...prefs().meals, lunch: { time: '08:15', minutes: 30 } } }) });
  const mon = blocks.filter((b) => localDateOf(new Date(b.start), TZ) === MON).sort((a, b) => a.start - b.start);
  for (let i = 1; i < mon.length; i++) expect(mon[i]!.start - mon[i - 1]!.end).toBeGreaterThanOrEqual(15 * 60_000);
});
test('current week: nothing before range start, no past breakfast', () => {
  const start = at(WED, '12:15');
  const { blocks } = run({ range: { start, end: at('2026-10-26', '00:00') } });
  expect(blocks.every((b) => b.start >= start)).toBe(true);
  expect(blocks.some((b) => b.mealSlot === 'breakfast' && localDateOf(new Date(b.start), TZ) === WED)).toBe(false);
  expect(blocks.some((b) => b.mealSlot === 'lunch' && localDateOf(new Date(b.start), TZ) === WED)).toBe(true);
});

function prep(over = {}) {
  const input = baseInput(over);
  const t = createTimeline(input);
  return placeMealPrep(t, input);
}
test('meal prep Sunday 16:00-17:30; if Sunday fully busy → Saturday closest to 16:00', () => {
  expect(prep()).toEqual([{ category: 'meal_prep', title: 'Meal prep', start: at(SUN, '16:00'), end: at(SUN, '17:30') }]);
  const r = prep({ busy: [{ start: at(SUN, '00:00'), end: at('2026-10-26', '00:00'), title: 'trip' }] });
  expect(r).toEqual([{ category: 'meal_prep', title: 'Meal prep', start: at(SAT, '16:00'), end: at(SAT, '17:30') }]);
});
test('meal prep skipped when one already exists; none when nothing fits', () => {
  expect(prep({ existing: [ref(WED, '16:00', '17:30', { category: 'meal_prep' })] })).toEqual([]);
  expect(prep({ busy: [{ start: at(MON, '00:00'), end: at('2026-10-26', '00:00'), title: 'trip' }] })).toEqual([]);
});
test('meal prep on a busy Sunday afternoon picks the nearest free start to 16:00', () => {
  const r = prep({ busy: [{ start: at(SUN, '15:00'), end: at(SUN, '16:30'), title: 'x' }] });
  // free from 16:45; the candidate nearest 16:00 is 16:45
  expect(r[0]!.start).toBe(at(SUN, '16:45'));
});

describe('per-day meal times (mealsByDay)', () => {
  const brunch = { time: '10:30', minutes: 45 };
  const weekend = (over = {}) => prefs({
    mealsByDay: [{ days: [6, 7], breakfast: null, lunch: brunch, dinner: prefs().meals.dinner, ...over }],
  });
  const on = (blocks: ReturnType<typeof run>['blocks'], date: string, slot: string) =>
    blocks.find((b) => localDateOf(new Date(b.start), TZ) === date && b.mealSlot === slot);

  test('override applies on its days only', () => {
    const { blocks } = run({ prefs: weekend() });
    expect(on(blocks, SAT, 'lunch')).toMatchObject({ start: at(SAT, '10:30'), end: at(SAT, '11:15') });
    expect(on(blocks, SUN, 'lunch')).toMatchObject({ start: at(SUN, '10:30') });
    expect(on(blocks, MON, 'lunch')).toMatchObject({ start: at(MON, '12:30'), end: at(MON, '13:00') });
    expect(on(blocks, MON, 'breakfast')).toMatchObject({ start: at(MON, '08:00') });
  });

  test('a null slot skips that meal on those days', () => {
    const { blocks } = run({ prefs: weekend({ dinner: null }) });
    expect(on(blocks, SAT, 'breakfast')).toBeUndefined();
    expect(on(blocks, SUN, 'dinner')).toBeUndefined();
    expect(on(blocks, WED, 'dinner')).toBeDefined();
    expect(blocks).toHaveLength(21 - 4);
  });

  test('no overrides → default times unchanged', () => {
    const { blocks } = run({ prefs: prefs({ mealsByDay: [] }) });
    expect(blocks).toHaveLength(21);
    expect(on(blocks, SAT, 'breakfast')).toMatchObject({ start: at(SAT, '08:00') });
  });

  test('onlySlots for a skipped meal places nothing', () => {
    const input = baseInput({ prefs: weekend() });
    expect(placeMeals(createTimeline(input), input, { onlySlots: [{ date: SAT, slot: 'breakfast' }] })).toEqual([]);
  });
});

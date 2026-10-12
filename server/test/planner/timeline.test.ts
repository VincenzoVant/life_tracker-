import { expect, test } from 'vitest';
import { createTimeline } from '../../src/planner/timeline.js';
import { at, baseInput, prefs, ref } from './fixtures.js';

const MON = '2026-10-19';

test('candidates respect padded occupied intervals', () => {
  const t = createTimeline(baseInput({ existing: [ref(MON, '12:00', '13:00')] }));
  const c = t.candidates(MON, 30, { within: { start: at(MON, '11:00'), end: at(MON, '14:00') } });
  expect(c.length).toBeGreaterThan(0);
  for (const x of c) {
    expect(x.end - x.start).toBe(30 * 60_000);
    expect(x.start % 900_000).toBe(0);
    expect(x.end <= at(MON, '11:45') || x.start >= at(MON, '13:15')).toBe(true);
  }
  expect(c[0]!.start).toBe(at(MON, '11:00'));
  expect(c.some((x) => x.start === at(MON, '13:15'))).toBe(true);
  expect(c.some((x) => x.start === at(MON, '13:00'))).toBe(false);
});
test('busy intervals are padded too and free intervals exclude them', () => {
  const t = createTimeline(baseInput({ busy: [{ start: at(MON, '10:00'), end: at(MON, '11:00'), title: 'x' }] }));
  expect(t.freeIntervals(MON)).toEqual([
    { start: at(MON, '08:00'), end: at(MON, '09:45') },
    { start: at(MON, '11:15'), end: at(MON, '22:30') },
  ]);
});
test('exclude removes ranges from candidates', () => {
  const t = createTimeline(baseInput());
  const c = t.candidates(MON, 60, { exclude: [{ start: at(MON, '08:00'), end: at(MON, '20:00') }] });
  expect(c[0]!.start).toBe(at(MON, '20:00'));
  expect(c.at(-1)!.end).toBe(at(MON, '22:30'));
});
test('occupy pads, updates loads and gymStarts', () => {
  const t = createTimeline(baseInput({ existing: [ref(MON, '07:00', '08:00', { category: 'workout', workoutType: 'gym' })] }));
  expect(t.gymStarts()).toEqual([at(MON, '07:00')]);
  t.occupy({ category: 'study', title: 'S', courseId: 'c1', start: at(MON, '09:00'), end: at(MON, '10:00') });
  t.occupy({ category: 'meal', title: 'Lunch', mealSlot: 'lunch', start: at(MON, '12:30'), end: at(MON, '13:00') });
  t.occupy({ category: 'workout', title: 'Gym', workoutType: 'gym', start: at(MON, '17:00'), end: at(MON, '18:15') });
  expect(t.load(MON)).toEqual({ planned: 60 + 75 + 60, study: 60, perCourse: { c1: 60 }, startup: 0, workouts: 2 });
  expect(t.gymStarts()).toEqual([at(MON, '07:00'), at(MON, '17:00')]);
  expect(t.freeIntervals(MON).some((f) => f.start < at(MON, '10:15') && f.end > at(MON, '09:00'))).toBe(false);
});
test('fixed and meal existing blocks do not count toward planned', () => {
  const t = createTimeline(baseInput({
    existing: [
      ref(MON, '10:00', '11:00', { category: 'study', source: 'fixed' }),
      ref(MON, '12:00', '12:30', { category: 'meal' }),
      ref(MON, '14:00', '15:00', { category: 'errand' }),
    ],
  }));
  expect(t.load(MON).planned).toBe(60);
  expect(t.load(MON).study).toBe(0);
});
test('bufferMinutes 0 lets candidates touch occupied blocks', () => {
  const t = createTimeline(baseInput({ prefs: prefs({ bufferMinutes: 0 }), existing: [ref(MON, '12:00', '13:00')] }));
  expect(t.candidates(MON, 30, { within: { start: at(MON, '12:00'), end: at(MON, '13:30') } })[0]!.start).toBe(at(MON, '13:00'));
});

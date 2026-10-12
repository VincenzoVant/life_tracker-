import { expect, test } from 'vitest';
import { ceilTo15, mergeIntervals, overlaps, padIntervals, subtractIntervals } from '../../src/planner/intervals.js';

test('merge/subtract/pad', () => {
  expect(mergeIntervals([{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 30, end: 40 }])).toEqual([
    { start: 0, end: 20 }, { start: 30, end: 40 },
  ]);
  expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 20, end: 30 }])).toEqual([
    { start: 0, end: 20 }, { start: 30, end: 100 },
  ]);
  expect(padIntervals([{ start: 600_000, end: 1_200_000 }], 5)).toEqual([{ start: 300_000, end: 1_500_000 }]);
});
test('merge sorts unsorted input and does not mutate it', () => {
  const xs = [{ start: 30, end: 40 }, { start: 0, end: 5 }, { start: 3, end: 8 }];
  const copy = structuredClone(xs);
  expect(mergeIntervals(xs)).toEqual([{ start: 0, end: 8 }, { start: 30, end: 40 }]);
  expect(xs).toEqual(copy);
});
test('subtract handles full cover, edge cuts and multiple cuts', () => {
  expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: -5, end: 15 }])).toEqual([]);
  expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 0, end: 4 }, { start: 8, end: 12 }])).toEqual([{ start: 4, end: 8 }]);
});
test('overlaps is half-open', () => {
  expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
  expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
});
test('ceilTo15', () => {
  expect(ceilTo15(0)).toBe(0);
  expect(ceilTo15(1)).toBe(900_000);
  expect(ceilTo15(900_000)).toBe(900_000);
});

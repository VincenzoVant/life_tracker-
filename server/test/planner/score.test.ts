import { expect, test } from 'vitest';
import { pickBest, scoreCandidate } from '../../src/planner/score.js';
import { at, TZ } from './fixtures.js';

const D = '2026-10-19';
const free = [{ start: at(D, '08:00'), end: at(D, '22:30') }];
const base = { preferred: [], dayLoadSameCategory: 0, free, minGap: 45, tz: TZ };
const c = (from: string, to: string) => ({ start: at(D, from), end: at(D, to) });

test('scoreCandidate components', () => {
  expect(scoreCandidate(c('10:00', '11:00'), base)).toBe(0);
  expect(scoreCandidate(c('10:00', '11:00'), { ...base, preferred: [c('09:00', '12:00')] })).toBe(10);
  expect(scoreCandidate(c('08:00', '09:00'), { ...base, preferred: [c('09:00', '12:00')] })).toBe(0);
  expect(scoreCandidate(c('10:00', '11:00'), { ...base, dayLoadSameCategory: 60 })).toBe(-2);
  expect(scoreCandidate(c('21:00', '21:30'), base)).toBe(-5);
  expect(scoreCandidate(c('08:15', '09:00'), base)).toBe(-3); // 15 min gap to the left edge < 45
  expect(scoreCandidate(c('08:45', '09:30'), base)).toBe(0); // 45 min gap is not < minGap
  expect(scoreCandidate(c('08:15', '22:15'), base)).toBe(-6); // both sides
  expect(scoreCandidate(c('10:00', '11:00'), { ...base, extraPenalty: 7 })).toBe(-7);
});
test('pickBest picks the highest score, ties to the earliest start; null when empty', () => {
  const cands = [c('12:00', '13:00'), c('10:00', '11:00'), c('14:00', '15:00')];
  expect(pickBest(cands, () => 1)).toEqual(c('10:00', '11:00'));
  expect(pickBest(cands, (x) => (x.start === at(D, '14:00') ? 5 : 1))).toEqual(c('14:00', '15:00'));
  expect(pickBest([], () => 0)).toBeNull();
});

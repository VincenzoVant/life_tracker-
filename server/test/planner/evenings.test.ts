import { eveningWindowUtc } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { reserveEvenings } from '../../src/planner/evenings.js';
import { createTimeline } from '../../src/planner/timeline.js';
import type { PlannerGoal } from '../../src/planner/types.js';
import { TZ, at, baseInput, prefs, ref } from './fixtures.js';

const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';
const FRI = '2026-10-23';

const goal = (count: number): PlannerGoal => ({ kind: 'free_evenings', count });
function run(over = {}) {
  const input = baseInput(over);
  return { input, r: reserveEvenings(createTimeline(input), input) };
}

test('reserves the N least-loaded evenings, earliest first on ties', () => {
  expect(run({ goals: [goal(2)] }).r.reserved).toEqual([MON, TUE]);
  const w = run({ goals: [goal(2)], existing: [ref(MON, '19:30', '22:00', { category: 'work' })] });
  expect(w.r.reserved).toEqual([TUE, WED]);
  expect(w.r.shortfall).toBeNull();
});
test('least-loaded wins over earliest', () => {
  const { r } = run({ goals: [goal(1)], existing: [ref(MON, '10:00', '12:00'), ref(TUE, '10:00', '11:00')] });
  expect(r.reserved).toEqual([WED]);
});
test('protected evenings always reserved (Fri) and count toward goal', () => {
  const p = prefs({ protectedEvenings: [5] });
  expect(run({ goals: [goal(2)], prefs: p }).r.reserved).toEqual([MON, FRI]);
  // protected beyond the goal count are still reserved
  expect(run({ goals: [goal(1)], prefs: prefs({ protectedEvenings: [5, 6] }) }).r.reserved).toEqual(['2026-10-23', '2026-10-24']);
});
test('shortfall when fewer eligible evenings than goal', () => {
  const work = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) =>
    ref(d, '19:30', '22:00', { category: 'startup' }),
  );
  const goalObj = goal(3);
  const { r } = run({ goals: [goalObj], existing: work });
  expect(r.reserved).toEqual(['2026-10-25']);
  expect(r.shortfall).toEqual({ goal: goalObj, missing: 2 });
});
test('a night out (busy 20:00-22:00) still counts as a free evening', () => {
  const { r } = run({ goals: [goal(1)], busy: [{ start: at(MON, '20:00'), end: at(MON, '22:00'), title: 'x' }] });
  expect(r.reserved).toEqual([MON]);
});
test('busy time covering the whole evening window makes it ineligible', () => {
  const w = eveningWindowUtc(MON, prefs(), TZ);
  const { r } = run({
    goals: [goal(1)],
    busy: [
      { start: w.start.getTime() - 60_000, end: w.start.getTime() + 60 * 60_000, title: 'a' },
      { start: w.start.getTime() + 60 * 60_000, end: w.end.getTime() + 60_000, title: 'b' },
    ],
  });
  expect(r.reserved).toEqual([TUE]);
});
test('current-week range starting Wed 12:00 → Mon/Tue ineligible', () => {
  const { r } = run({ goals: [goal(2)], range: { start: at(WED, '12:00'), end: at('2026-10-26', '00:00') } });
  expect(r.reserved).toEqual([WED, '2026-10-22']);
});
test('no free_evenings goal → nothing reserved; intervals are the evening windows', () => {
  const none = run();
  expect(none.r).toEqual({ reserved: [], reservedIntervals: [], shortfall: null });
  const { r, input } = run({ goals: [goal(1)] });
  const w = eveningWindowUtc(MON, input.prefs, TZ);
  expect(r.reservedIntervals).toEqual([{ start: w.start.getTime(), end: w.end.getTime() }]);
});

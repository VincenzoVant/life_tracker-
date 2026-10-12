import { addDays, localDateOf } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { createTimeline } from '../../src/planner/timeline.js';
import type { PlannerGoal } from '../../src/planner/types.js';
import { placeWorkouts } from '../../src/planner/workouts.js';
import { TZ, at, baseInput, prefs, ref } from './fixtures.js';

const MON = '2026-10-19';
const WED = '2026-10-21';
const FRI = '2026-10-23';
const dateOf = (ms: number) => localDateOf(new Date(ms), TZ);
const week = (i: number) => addDays(MON, i);

function run(goals: PlannerGoal[], over = {}) {
  const input = baseInput({ goals, ...over });
  return placeWorkouts(createTimeline(input), input);
}
const gym = (count: number): PlannerGoal => ({ kind: 'workout', workoutType: 'gym', count });
const cardio = (count: number): PlannerGoal => ({ kind: 'workout', workoutType: 'cardio', count });
const sport = (count: number): PlannerGoal => ({ kind: 'workout', workoutType: 'sport', count });

test('gym 2 + cardio 1 on empty week → gym Mon & Wed, cardio Fri, all inside 17:00-19:00 window', () => {
  const { blocks, shortfalls } = run([gym(2), cardio(1)]);
  expect(shortfalls).toEqual([]);
  const byType = (t: string) => blocks.filter((b) => b.workoutType === t).map((b) => dateOf(b.start)).sort();
  expect(byType('gym')).toEqual([MON, WED]);
  expect(byType('cardio')).toEqual([FRI]);
  for (const b of blocks) {
    const d = dateOf(b.start);
    expect(b.start).toBeGreaterThanOrEqual(at(d, '17:00'));
    expect(b.end).toBeLessThanOrEqual(at(d, '19:00'));
    expect(b.category).toBe('workout');
  }
  expect(blocks.find((b) => b.workoutType === 'gym')).toMatchObject({ title: 'Gym' });
  expect(blocks.find((b) => b.workoutType === 'cardio')).toMatchObject({ title: 'Cardio' });
  expect(blocks.filter((b) => b.workoutType === 'gym').every((b) => (b.end - b.start) / 60_000 === 75)).toBe(true);
});
test('gym spacing: existing gym Mon 17:00 → next gym not before Wed 09:00 (40h)', () => {
  const { blocks } = run([gym(1)], { existing: [ref(MON, '17:00', '18:15', { category: 'workout', workoutType: 'gym' })] });
  expect(blocks).toHaveLength(1);
  expect(blocks[0]!.start).toBeGreaterThanOrEqual(at(WED, '09:00'));
});
test('never two workouts on the same day while other allowed days have room', () => {
  const { blocks, shortfalls } = run([gym(2), cardio(1), sport(1)]);
  expect(shortfalls).toEqual([]);
  expect(blocks).toHaveLength(4);
  expect(new Set(blocks.map((b) => dateOf(b.start))).size).toBe(4);
});
test('allowedWorkoutDays [6,7] and goal 2 gym → 1 gym placed (Sat→Sun < 40h) and shortfall { missing: 1 }', () => {
  const g = gym(2);
  const { blocks, shortfalls } = run([g], { prefs: prefs({ allowedWorkoutDays: [6, 7] }) });
  expect(blocks).toHaveLength(1);
  expect([week(5), week(6)]).toContain(dateOf(blocks[0]!.start));
  expect(shortfalls).toEqual([{ goal: g, missing: 1 }]);
});
test('only allowed days are used', () => {
  const { blocks } = run([cardio(2)], { prefs: prefs({ allowedWorkoutDays: [2, 4] }) });
  expect(blocks.map((b) => dateOf(b.start)).sort()).toEqual([week(1), week(3)]);
});
test('maxPlannedMinutesPerDay respected', () => {
  const busyDays = [0, 1, 2, 3, 4, 5].map((i) => ref(week(i), '10:00', '11:00', { category: 'errand' }));
  const p = prefs({ maxPlannedMinutesPerDay: 100 });
  const g = gym(2);
  const { blocks, shortfalls } = run([g], { prefs: p, existing: busyDays });
  // only Sunday has room for 75 min (60 + 75 > 100 elsewhere)
  expect(blocks).toHaveLength(1);
  expect(dateOf(blocks[0]!.start)).toBe(week(6));
  expect(shortfalls).toEqual([{ goal: g, missing: 1 }]);
});
test('a day with no room yields a shortfall, not an error', () => {
  const g = sport(1);
  const full = [{ start: at(MON, '00:00'), end: at('2026-10-26', '00:00'), title: 'trip' }];
  expect(run([g], { busy: full })).toEqual({ blocks: [], shortfalls: [{ goal: g, missing: 1 }] });
});

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

const local = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

test('availability: workouts only go inside the hard windows of their weekday', () => {
  const p = prefs({
    workoutAvailability: [
      { days: [2, 4], start: '06:30', end: '08:30' },
      { days: [6], start: '10:00', end: '12:00' },
    ],
    earliestBlock: '06:00',
    sleep: { start: '23:30', end: '06:00' },
    workoutBuffer: { before: 0, after: 0 },
  });
  const { blocks, shortfalls } = run([gym(1), cardio(2)], { prefs: p });
  expect(shortfalls).toEqual([]);
  expect(blocks).toHaveLength(3);
  for (const b of blocks) {
    const d = dateOf(b.start);
    expect([week(1), week(3), week(5)]).toContain(d);
    const [from, to] = d === week(5) ? ['10:00', '12:00'] : ['06:30', '08:30'];
    expect(b.start).toBeGreaterThanOrEqual(at(d, from));
    expect(b.end).toBeLessThanOrEqual(at(d, to));
  }
});
test('availability too tight → shortfall', () => {
  const g = gym(2);
  const p = prefs({ workoutAvailability: [{ days: [3], start: '18:00', end: '19:00' }] });
  expect(run([g], { prefs: p })).toEqual({ blocks: [], shortfalls: [{ goal: g, missing: 2 }] });
  const c = sport(2);
  const one = run([c], { prefs: prefs({ workoutAvailability: [{ days: [3], start: '17:00', end: '19:00' }] }) });
  expect(one.blocks).toHaveLength(1);
  expect(one.shortfalls).toEqual([{ goal: c, missing: 1 }]);
});
test('availability is intersected with allowedWorkoutDays', () => {
  const p = prefs({ workoutAvailability: [{ days: [1, 2], start: '17:00', end: '20:00' }], allowedWorkoutDays: [2] });
  const g = gym(2);
  const { blocks, shortfalls } = run([g], { prefs: p });
  expect(blocks.map((b) => dateOf(b.start))).toEqual([week(1)]);
  expect(shortfalls).toEqual([{ goal: g, missing: 1 }]);
});
test('empty availability keeps the old behaviour (anywhere in the day)', () => {
  const noBuffer = { workoutBuffer: { before: 0, after: 0 } };
  const a = run([gym(2), cardio(1)], { prefs: prefs({ workoutAvailability: [], ...noBuffer }) });
  const b = run([gym(2), cardio(1)], { prefs: prefs(noBuffer) });
  expect(a).toEqual(b);
  const anyTime = run([cardio(1)], { prefs: prefs({ preferredWorkoutWindows: [], allowedWorkoutDays: [1] }) });
  expect(local(anyTime.blocks[0]!.start) < '17:00').toBe(true);
});
test('buffer: kept after a class and before a meal; proposed blocks carry their pads', () => {
  // Monday only, available 09:00-14:00; a class 09:00-10:00 and lunch 12:30-13:00.
  const p = prefs({
    allowedWorkoutDays: [1],
    workoutAvailability: [{ days: [1], start: '09:00', end: '14:00' }],
    workoutBuffer: { before: 30, after: 45 },
    preferredWorkoutWindows: [],
  });
  const existing = [
    ref(MON, '09:00', '10:00', { category: 'study', source: 'fixed', padBefore: 15, padAfter: 15 }),
    ref(MON, '12:30', '13:00', { category: 'meal', source: 'planner', mealSlot: 'lunch' }),
  ];
  const { blocks } = run([cardio(1)], { prefs: p, existing });
  expect(blocks).toHaveLength(1);
  const b = blocks[0]!;
  expect(b).toMatchObject({ padBefore: 30, padAfter: 45 });
  expect(b.start).toBeGreaterThanOrEqual(at(MON, '10:30'));
  expect(b.end).toBeLessThanOrEqual(at(MON, '11:45'));
  // Only 10:30-11:45 is usable once the buffers are kept, so 90 minutes of sport no longer fits.
  const s = sport(1);
  expect(run([s], { prefs: p, existing })).toEqual({ blocks: [], shortfalls: [{ goal: s, missing: 1 }] });
});
test('buffer: a second workout keeps the larger facing buffer from the first', () => {
  const p = prefs({
    allowedWorkoutDays: [1],
    workoutAvailability: [{ days: [1], start: '09:00', end: '13:00' }],
    workoutBuffer: { before: 0, after: 60 },
    preferredWorkoutWindows: [],
  });
  const { blocks } = run([cardio(2)], { prefs: p });
  expect(blocks).toHaveLength(2);
  const [a, b] = [...blocks].sort((x, y) => x.start - y.start);
  expect(b!.start - a!.end).toBeGreaterThanOrEqual(60 * 60_000);
});

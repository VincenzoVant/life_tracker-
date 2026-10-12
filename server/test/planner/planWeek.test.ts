import { addDays, localDateOf, localTimeOf, weekRangeUtc } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { planWeek } from '../../src/planner/index.js';
import type { PlannerGoal, PlannerInput } from '../../src/planner/types.js';
import { TZ, at, baseInput, ref } from './fixtures.js';
import { checkInvariants } from './invariants.js';

const MON = '2026-10-19';
const WEEK_END = at('2026-10-26', '00:00');
const mins = (b: { start: number; end: number }) => (b.end - b.start) / 60_000;

const study = (courseId: string, minutes: number): PlannerGoal => ({ kind: 'study', courseId, courseName: `Course ${courseId}`, minutes });
const wk = (workoutType: 'gym' | 'cardio' | 'sport', count: number): PlannerGoal => ({ kind: 'workout', workoutType, count });

function plan(input: PlannerInput) {
  const out = planWeek(input);
  expect(checkInvariants(input, out)).toEqual([]);
  return out;
}

test('typical student week: all goals met, 21 meals, 1 meal prep, 2 reserved evenings', () => {
  const input = baseInput({
    existing: [
      ref(MON, '10:00', '11:20', { category: 'study', source: 'fixed', courseId: 'A' }),
      ref('2026-10-21', '10:00', '11:20', { category: 'study', source: 'fixed', courseId: 'A' }),
      ref('2026-10-20', '13:00', '18:00', { category: 'work', source: 'fixed' }),
      ref('2026-10-22', '13:00', '18:00', { category: 'work', source: 'fixed' }),
    ],
    goals: [
      study('A', 360), study('B', 240), { kind: 'startup', minutes: 600 },
      wk('gym', 2), wk('cardio', 1), wk('sport', 1), { kind: 'free_evenings', count: 2 },
    ],
    startupTasks: [{ id: 't1', title: 'Landing page' }],
  });
  const out = plan(input);
  expect(out.shortfalls).toEqual([]);
  expect(out.blocks.filter((b) => b.category === 'meal')).toHaveLength(21);
  expect(out.blocks.filter((b) => b.category === 'meal_prep')).toHaveLength(1);
  expect(out.reservedEvenings).toHaveLength(2);
  const sum = (pred: (b: (typeof out.blocks)[number]) => boolean) => out.blocks.filter(pred).reduce((n, b) => n + mins(b), 0);
  expect(sum((b) => b.courseId === 'A')).toBe(360);
  expect(sum((b) => b.courseId === 'B')).toBe(240);
  expect(sum((b) => b.category === 'startup')).toBe(600);
  expect(out.blocks.filter((b) => b.category === 'workout')).toHaveLength(4);
});

test('overloaded week: work 08:00-22:30 every weekday → shortfalls; sum(placed)+missing = goal', () => {
  const goals: PlannerGoal[] = [study('A', 1000), study('B', 1000), { kind: 'startup', minutes: 1500 }];
  const input = baseInput({
    existing: [0, 1, 2, 3, 4].map((i) => ref(addDays(MON, i), '08:00', '22:30', { category: 'work', source: 'fixed' })),
    goals,
  });
  const out = plan(input);
  expect(out.shortfalls.length).toBe(3);
  for (const g of goals) {
    const placed = out.blocks
      .filter((b) => (g.kind === 'study' ? b.courseId === g.courseId : b.category === 'startup'))
      .reduce((n, b) => n + mins(b), 0);
    const goalMinutes = g.kind === 'free_evenings' || g.kind === 'workout' ? 0 : g.minutes;
    const missing = out.shortfalls.find((s) => s.goal === g)?.missing ?? 0;
    expect(missing).toBeGreaterThan(0);
    expect(placed + missing).toBe(goalMinutes);
  }
  // only the weekend has room
  expect(out.blocks.every((b) => ['2026-10-24', '2026-10-25'].includes(localDateOf(new Date(b.start), TZ)))).toBe(true);
});

test('zero free time (busy 00:00-24:00 all week) → blocks [] and every goal fully in shortfalls', () => {
  const goals: PlannerGoal[] = [
    study('A', 360), { kind: 'startup', minutes: 300 }, wk('gym', 2), wk('cardio', 1), { kind: 'free_evenings', count: 2 },
  ];
  const input = baseInput({ goals, busy: [{ start: at(MON, '00:00'), end: WEEK_END, title: 'away' }] });
  const out = plan(input);
  expect(out.blocks).toEqual([]);
  expect(out.reservedEvenings).toEqual([]);
  expect(out.shortfalls.map((s) => [s.goal, s.missing])).toEqual([
    [goals[0], 360], [goals[1], 300], [goals[2], 2], [goals[3], 1], [goals[4], 2],
  ]);
});

test('deterministic: same input twice → deep equal output; shuffled existing/busy order → same output', () => {
  const existing = [
    ref(MON, '10:00', '11:20', { category: 'study', source: 'fixed' }),
    ref('2026-10-20', '13:00', '18:00', { category: 'work', source: 'fixed' }),
    ref('2026-10-22', '09:00', '10:00', { category: 'errand' }),
  ];
  const busy = [
    { start: at('2026-10-21', '12:00'), end: at('2026-10-21', '13:00'), title: 'a' },
    { start: at('2026-10-23', '15:00'), end: at('2026-10-23', '16:30'), title: 'b' },
  ];
  const goals: PlannerGoal[] = [study('A', 300), study('B', 300), { kind: 'startup', minutes: 360 }, wk('gym', 2), wk('cardio', 1), { kind: 'free_evenings', count: 2 }];
  const a = planWeek(baseInput({ existing, busy, goals }));
  const b = planWeek(baseInput({ existing, busy, goals }));
  const c = planWeek(baseInput({ existing: [...existing].reverse(), busy: [...busy].reverse(), goals }));
  expect(b).toEqual(a);
  expect(c).toEqual(a);
});

test('DST week 2026-10-26: invariants hold and Sun 2026-11-01 lunch starts 12:30 local', () => {
  const r = weekRangeUtc('2026-10-26', TZ);
  const input = baseInput({
    range: { start: r.start.getTime(), end: r.end.getTime() },
    goals: [study('A', 360), { kind: 'startup', minutes: 300 }, wk('gym', 2), { kind: 'free_evenings', count: 2 }],
  });
  const out = plan(input);
  const lunch = out.blocks.find((b) => b.mealSlot === 'lunch' && localDateOf(new Date(b.start), TZ) === '2026-11-01')!;
  expect(localTimeOf(new Date(lunch.start), TZ)).toBe('12:30');
  expect(mins(lunch)).toBe(30);
  expect(out.blocks.filter((b) => b.category === 'meal')).toHaveLength(21);
});

test('current-week range from Wed 12:15 → no block before range.start', () => {
  const start = at('2026-10-14', '12:15');
  const input = baseInput({
    range: { start, end: at('2026-10-19', '00:00') },
    goals: [study('A', 240), { kind: 'startup', minutes: 120 }, wk('gym', 1), { kind: 'free_evenings', count: 2 }],
  });
  const out = plan(input);
  expect(out.blocks.length).toBeGreaterThan(0);
  expect(out.blocks.every((b) => b.start >= start)).toBe(true);
  expect(out.blocks.some((b) => b.mealSlot === 'breakfast' && localDateOf(new Date(b.start), TZ) === '2026-10-14')).toBe(false);
  expect(out.reservedEvenings.every((d) => d >= '2026-10-14')).toBe(true);
});

test('blocks are sorted by start, then category order', () => {
  const out = plan(baseInput({ goals: [study('A', 120), wk('gym', 1)] }));
  for (let i = 1; i < out.blocks.length; i++) expect(out.blocks[i]!.start).toBeGreaterThanOrEqual(out.blocks[i - 1]!.start);
});

test('checkInvariants catches violations', () => {
  const input = baseInput();
  const bad = {
    blocks: [
      { category: 'study' as const, title: 'x', start: at(MON, '07:00'), end: at(MON, '09:00') },
      { category: 'study' as const, title: 'y', start: at(MON, '08:40'), end: at(MON, '09:40') },
    ],
    shortfalls: [],
    reservedEvenings: [],
  };
  const errs = checkInvariants(input, bad);
  expect(errs.some((e) => e.includes('outside day window'))).toBe(true);
  expect(errs.some((e) => e.includes('closer than buffer'))).toBe(true);
});

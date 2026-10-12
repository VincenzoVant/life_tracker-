import { addDays, isoWeekday, localDateOf } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { nextChunk, placeStartup, placeStudy } from '../../src/planner/chunked.js';
import { reserveEvenings } from '../../src/planner/evenings.js';
import { createTimeline } from '../../src/planner/timeline.js';
import type { PlannerGoal } from '../../src/planner/types.js';
import { TZ, at, baseInput, ref } from './fixtures.js';

const MON = '2026-10-19';
const SUN = '2026-10-25';
const dateOf = (ms: number) => localDateOf(new Date(ms), TZ);
const study = (courseId: string, minutes: number): PlannerGoal => ({ kind: 'study', courseId, courseName: `Course ${courseId}`, minutes });
const mins = (b: { start: number; end: number }) => (b.end - b.start) / 60_000;

test('nextChunk', () => {
  expect(nextChunk(360, 45, 120)).toBe(120);
  expect(nextChunk(150, 45, 120)).toBe(105); // 150-120=30 < 45 → 150-45
  expect(nextChunk(30, 45, 120)).toBe(45);
  expect(nextChunk(100, 45, 120)).toBe(105); // round up to 15
});

test('study 6h course A + 4h course B on empty week: totals met, block lengths 45..120, per-course/day ≤ 180, study/day ≤ 300', () => {
  const input = baseInput({ goals: [study('A', 360), study('B', 240)] });
  const { blocks, shortfalls } = placeStudy(createTimeline(input), input, []);
  expect(shortfalls).toEqual([]);
  const total = (id: string) => blocks.filter((b) => b.courseId === id).reduce((n, b) => n + mins(b), 0);
  expect(total('A')).toBe(360);
  expect(total('B')).toBe(240);
  for (const b of blocks) {
    expect(mins(b)).toBeGreaterThanOrEqual(45);
    expect(mins(b)).toBeLessThanOrEqual(120);
    expect(b.category).toBe('study');
    expect(b.start % 900_000).toBe(0);
    expect(b.end % 900_000).toBe(0);
  }
  expect(blocks[0]!.title).toMatch(/^Study — Course /);
  const perDay = new Map<string, number>();
  const perCourseDay = new Map<string, number>();
  for (const b of blocks) {
    perDay.set(dateOf(b.start), (perDay.get(dateOf(b.start)) ?? 0) + mins(b));
    const k = `${b.courseId}|${dateOf(b.start)}`;
    perCourseDay.set(k, (perCourseDay.get(k) ?? 0) + mins(b));
  }
  expect(Math.max(...perDay.values())).toBeLessThanOrEqual(300);
  expect(Math.max(...perCourseDay.values())).toBeLessThanOrEqual(180);
});

test('study spreads: course A appears on ≥ 3 distinct days', () => {
  const input = baseInput({ goals: [study('A', 360), study('B', 240)] });
  const { blocks } = placeStudy(createTimeline(input), input, []);
  expect(new Set(blocks.filter((b) => b.courseId === 'A').map((b) => dateOf(b.start))).size).toBeGreaterThanOrEqual(3);
});

test('reserved evenings receive no study or startup', () => {
  const input = baseInput({
    goals: [study('A', 1200), { kind: 'startup', minutes: 1200 }, { kind: 'free_evenings', count: 3 }],
    startupTasks: [{ id: 't1', title: 'Landing page' }],
  });
  const t = createTimeline(input);
  const { reservedIntervals, reserved } = reserveEvenings(t, input);
  expect(reserved).toHaveLength(3);
  const blocks = [...placeStudy(t, input, reservedIntervals).blocks, ...placeStartup(t, input, reservedIntervals).blocks];
  expect(blocks.length).toBeGreaterThan(5);
  for (const b of blocks) for (const r of reservedIntervals) expect(b.start < r.end && r.start < b.end).toBe(false);
});

test('startup prefers weekday evenings/weekend mornings and links tasks round-robin', () => {
  const input = baseInput({
    goals: [{ kind: 'startup', minutes: 540 }],
    startupTasks: [{ id: 't1', title: 'Landing page' }, { id: 't2', title: 'Pricing' }],
  });
  const { blocks, shortfalls } = placeStartup(createTimeline(input), input, []);
  expect(shortfalls).toEqual([]);
  expect(blocks.reduce((n, b) => n + mins(b), 0)).toBe(540);
  expect(blocks.map((b) => b.startupTaskId)).toEqual(blocks.map((_, i) => (i % 2 === 0 ? 't1' : 't2')));
  expect(blocks[0]!.title).toBe('Startup — Landing page');
  expect(blocks[1]!.title).toBe('Startup — Pricing');
  for (const b of blocks) {
    const d = dateOf(b.start);
    const weekend = isoWeekday(d) >= 6;
    const [from, to] = weekend ? ['09:00', '13:00'] : ['19:00', '22:30'];
    expect(b.start).toBeGreaterThanOrEqual(at(d, from!));
    expect(b.end).toBeLessThanOrEqual(at(d, to!));
    expect(mins(b)).toBeGreaterThanOrEqual(60);
    expect(mins(b)).toBeLessThanOrEqual(180);
  }
});

test('startup without tasks is titled plain Startup', () => {
  const input = baseInput({ goals: [{ kind: 'startup', minutes: 60 }] });
  const { blocks } = placeStartup(createTimeline(input), input, []);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({ title: 'Startup', category: 'startup' });
  expect(blocks[0]!.startupTaskId).toBeUndefined();
});

test('overloaded week → study shortfall equals unplaced minutes', () => {
  // Mon-Sat completely busy; only Sunday is free, where one course may take at most 180 min.
  const g = study('A', 1000);
  const input = baseInput({
    goals: [g],
    busy: [{ start: at(MON, '00:00'), end: at(SUN, '00:00'), title: 'away' }],
  });
  const { blocks, shortfalls } = placeStudy(createTimeline(input), input, []);
  const placed = blocks.reduce((n, b) => n + mins(b), 0);
  expect(placed).toBe(180);
  expect(shortfalls).toEqual([{ goal: g, missing: 1000 - placed }]);
});

test('zero free time → no blocks, whole goal is the shortfall', () => {
  const g = study('A', 300);
  const input = baseInput({ goals: [g], busy: [{ start: at(MON, '00:00'), end: at(addDays(MON, 7), '00:00'), title: 'x' }] });
  expect(placeStudy(createTimeline(input), input, [])).toEqual({ blocks: [], shortfalls: [{ goal: g, missing: 300 }] });
});

test('existing study load counts against the daily caps', () => {
  const input = baseInput({
    goals: [study('A', 120)],
    existing: [ref(MON, '08:00', '10:30', { category: 'study', courseId: 'A', source: 'manual' })],
    busy: [{ start: at(addDays(MON, 1), '00:00'), end: at(addDays(MON, 7), '00:00'), title: 'away' }],
  });
  const { blocks, shortfalls } = placeStudy(createTimeline(input), input, []);
  // Monday already has 150 of the course's 180 minutes: only a 30-minute slot is left, below the 45-minute minimum.
  expect(blocks).toEqual([]);
  expect(shortfalls[0]!.missing).toBe(120);
});

test('startup block that cannot fit a preferred window at full size shrinks to fit it (weekday 20:00-22:30)', () => {
  // Monday only; dinner 19:00-19:45 + 15 min buffer leaves 20:00-22:30 (150 min) of the preferred evening window.
  const input = baseInput({
    range: { start: at(MON, '00:00'), end: at(addDays(MON, 1), '00:00') },
    goals: [{ kind: 'startup', minutes: 180 }],
    existing: [ref(MON, '19:00', '19:45', { category: 'meal', source: 'planner', mealSlot: 'dinner' })],
  });
  const { blocks, shortfalls } = placeStartup(createTimeline(input), input, []);
  expect(blocks[0]).toMatchObject({ start: at(MON, '20:00'), end: at(MON, '22:30') });
  const placed = blocks.reduce((n, b) => n + mins(b), 0);
  expect(placed).toBeGreaterThanOrEqual(180);
  expect(shortfalls).toEqual([]);
});

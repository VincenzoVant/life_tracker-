import { addDays, eveningWindowUtc, isoWeekday, localDateOf, localTimeOf } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { planWeek } from '../../src/planner/index.js';
import { placeProjects } from '../../src/planner/projects.js';
import { createTimeline } from '../../src/planner/timeline.js';
import type { PlannerGoal, PlannerInput } from '../../src/planner/types.js';
import { TZ, baseInput, prefs, ref } from './fixtures.js';
import { checkInvariants } from './invariants.js';

const MON = '2026-10-19';
const mins = (b: { start: number; end: number }) => (b.end - b.start) / 60_000;
const dateOf = (ms: number) => localDateOf(new Date(ms), TZ);

type ProjectGoal = Extract<PlannerGoal, { kind: 'project' }>;
const project = (projectId: string, minutes: number, extra: Partial<ProjectGoal> = {}): ProjectGoal => ({
  kind: 'project',
  projectId,
  title: `Project ${projectId}`,
  category: 'other',
  minutes,
  windows: [],
  block: { min: 60, max: 120 },
  priority: 2,
  ...extra,
});

function plan(input: PlannerInput) {
  const out = planWeek(input);
  expect(checkInvariants(input, out)).toEqual([]);
  return out;
}

test('places each project with its own block sizes, title, category and links', () => {
  const input = baseInput({
    goals: [
      project('guitar', 240, { title: 'Guitar', block: { min: 30, max: 45 } }),
      project('exam', 180, { title: 'Exam prep', category: 'study', courseId: 'A', block: { min: 90, max: 90 } }),
    ],
  });
  const out = plan(input);
  expect(out.shortfalls).toEqual([]);
  const guitar = out.blocks.filter((b) => b.projectId === 'guitar');
  expect(guitar.reduce((n, b) => n + mins(b), 0)).toBe(240);
  for (const b of guitar) {
    expect(b).toMatchObject({ title: 'Guitar', category: 'other' });
    expect(b.courseId).toBeUndefined();
    expect(mins(b)).toBeGreaterThanOrEqual(30);
    expect(mins(b)).toBeLessThanOrEqual(45);
  }
  const exam = out.blocks.filter((b) => b.projectId === 'exam');
  expect(exam.map(mins)).toEqual([90, 90]);
  for (const b of exam) expect(b).toMatchObject({ title: 'Exam prep', category: 'study', courseId: 'A' });
  // Spread over the week rather than stacked on one day.
  expect(new Set(guitar.map((b) => dateOf(b.start))).size).toBeGreaterThanOrEqual(4);
});

test('higher priority gets the scarce time; the low-priority project is the shortfall', () => {
  // Only Monday evening is free: 19:15-22:30 after the buffer, room for one 2-hour block.
  const busyDays = [1, 2, 3, 4, 5, 6].map((i) => ref(addDays(MON, i), '08:00', '22:30', { category: 'work', source: 'fixed' }));
  const input = baseInput({
    existing: [...busyDays, ref(MON, '08:00', '19:00', { category: 'work', source: 'fixed' })],
    goals: [project('low', 120, { priority: 3 }), project('high', 120, { priority: 1 })],
  });
  const out = placeProjects(createTimeline(input), input, []);
  expect(out.blocks.filter((b) => b.projectId === 'high').reduce((n, b) => n + mins(b), 0)).toBe(120);
  expect(out.shortfalls).toHaveLength(1);
  expect(out.shortfalls[0]!.goal).toMatchObject({ kind: 'project', projectId: 'low' });
});

test('preferred windows are used when they have room', () => {
  const windows = [{ days: [6, 7] as (6 | 7)[], start: '10:00', end: '13:00' }];
  const input = baseInput({ goals: [project('hike', 240, { windows, block: { min: 120, max: 120 } })] });
  const out = plan(input);
  const hikes = out.blocks.filter((b) => b.projectId === 'hike');
  expect(hikes).toHaveLength(2);
  for (const b of hikes) {
    expect(isoWeekday(dateOf(b.start))).toBeGreaterThanOrEqual(6);
    expect(localTimeOf(new Date(b.start), TZ) >= '10:00').toBe(true);
    expect(localTimeOf(new Date(b.end), TZ) <= '13:00').toBe(true);
  }
});

test('relax time does not use up the daily planned cap; other projects do', () => {
  const input = baseInput({
    prefs: prefs({ maxPlannedMinutesPerDay: 60 }),
    existing: [0, 1, 2, 3, 4, 5, 6].map((i) => ref(addDays(MON, i), '08:00', '09:00', { category: 'errand', source: 'manual' })),
    goals: [project('sauna', 180, { category: 'rest' }), project('fun', 60)],
  });
  const t = createTimeline(input);
  const { blocks, shortfalls } = placeProjects(t, input, []);
  expect(blocks.filter((b) => b.projectId === 'sauna').reduce((n, b) => n + mins(b), 0)).toBe(180);
  expect(blocks.some((b) => b.projectId === 'fun')).toBe(false);
  expect(shortfalls.map((s) => (s.goal.kind === 'project' ? s.goal.projectId : ''))).toEqual(['fun']);
  // Placed rest leaves the planned load untouched.
  for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(t.load(addDays(MON, d)).planned).toBe(60);
});

test('only relax projects may use reserved free evenings', () => {
  const evenings = [{ days: [1, 2, 3, 4, 5, 6, 7] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[], start: '19:30', end: '22:30' }];
  const input = baseInput({
    goals: [
      { kind: 'free_evenings', count: 7 },
      project('read', 240, { category: 'rest', windows: evenings }),
      project('code', 240, { windows: evenings }),
    ],
  });
  const out = plan(input);
  expect(out.reservedEvenings).toHaveLength(7);
  const inEvening = (b: { start: number; end: number }) => {
    const w = eveningWindowUtc(dateOf(b.start), input.prefs, TZ);
    return b.start < w.end.getTime() && w.start.getTime() < b.end;
  };
  const read = out.blocks.filter((b) => b.projectId === 'read');
  const code = out.blocks.filter((b) => b.projectId === 'code');
  expect(read.reduce((n, b) => n + mins(b), 0)).toBe(240);
  expect(read.every(inEvening)).toBe(true);
  expect(code.reduce((n, b) => n + mins(b), 0)).toBe(240);
  expect(code.some(inEvening)).toBe(false);
});

test('study projects respect the daily study cap and come on top of the course goal', () => {
  const input = baseInput({
    prefs: prefs({ maxStudyMinutesPerDay: 120 }),
    goals: [
      { kind: 'study', courseId: 'A', courseName: 'Course A', minutes: 360 },
      project('exam', 360, { category: 'study', courseId: 'A', block: { min: 60, max: 60 } }),
    ],
  });
  const out = plan(input);
  const study = out.blocks.filter((b) => b.category === 'study');
  expect(study.filter((b) => !b.projectId).reduce((n, b) => n + mins(b), 0)).toBe(360);
  expect(study.filter((b) => b.projectId === 'exam').reduce((n, b) => n + mins(b), 0)).toBe(360);
});

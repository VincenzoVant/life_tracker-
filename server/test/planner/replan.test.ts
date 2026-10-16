import { expect, test } from 'vitest';
import { placeMeals } from '../../src/planner/meals.js';
import { replan, type MovableBlock, type PlanChangeCore, type ReplanInput } from '../../src/planner/replan.js';
import { createTimeline } from '../../src/planner/timeline.js';
import type { PlannerBlockRef, ProposedBlock } from '../../src/planner/types.js';
import { TZ, at, baseInput, prefs, ref } from './fixtures.js';
import { checkInvariants } from './invariants.js';

const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';

let seq = 0;
function mv(date: string, from: string, to: string, extra: Partial<MovableBlock> = {}): MovableBlock {
  seq += 1;
  return { id: `b${seq}`, category: 'study', title: 'Study — Algorithms', courseId: 'algo', start: at(date, from), end: at(date, to), ...extra };
}

function input(over: Partial<ReplanInput> & Pick<ReplanInput, 'trigger'>): ReplanInput {
  return { ...baseInput(), movable: [], ...over };
}

const trigger = (date: string, from: string, to: string, endDate = date) => ({
  title: 'Night out', start: at(date, from), end: at(endDate, to),
});

/** Re-checks planner invariants on the result: new placements against everything that stayed put. */
function violations(inp: ReplanInput, changes: PlanChangeCore[]): string[] {
  const touched = new Set(changes.flatMap((c) => (c.type === 'added' ? [] : [c.blockId])));
  const stayed: PlannerBlockRef[] = inp.movable
    .filter((m) => !touched.has(m.id))
    .map((m) => ({ start: m.start, end: m.end, category: m.category, source: 'planner', courseId: m.courseId, workoutType: m.workoutType, mealSlot: m.mealSlot }));
  const shortened: PlannerBlockRef[] = changes.flatMap((c) => {
    const m = inp.movable.find((x) => c.type === 'shortened' && x.id === c.blockId);
    return c.type === 'shortened' && m ? [{ ...c.to, category: m.category, source: 'planner' as const, courseId: m.courseId }] : [];
  });
  const blocks: ProposedBlock[] = changes.flatMap((c) => {
    if (c.type === 'added') return [c.block];
    if (c.type !== 'moved') return [];
    const m = inp.movable.find((x) => x.id === c.blockId)!;
    return [{
      ...c.to, category: m.category, title: m.title,
      ...(m.courseId ? { courseId: m.courseId } : {}),
      ...(m.workoutType ? { workoutType: m.workoutType } : {}),
      ...(m.mealSlot ? { mealSlot: m.mealSlot } : {}),
    }];
  });
  const trig: PlannerBlockRef = { start: inp.trigger.start, end: inp.trigger.end, category: 'social', source: 'quick_add' };
  const full = { ...inp, existing: [...inp.existing, ...stayed, ...shortened, trig] };
  return checkInvariants(full, { blocks, shortfalls: [], reservedEvenings: [] });
}

test('night out Tue 19:00-23:30 moves the evening study block to another day; nothing else changes', () => {
  const study = mv(TUE, '19:00', '21:00');
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({
    existing: [ref(TUE, '10:00', '11:00', { category: 'other', source: 'fixed' })],
    movable: [study, gym],
    trigger: trigger(TUE, '19:00', '23:30'),
  });
  const out = replan(inp);
  expect(out.changes).toHaveLength(1);
  const c = out.changes[0]!;
  expect(c).toMatchObject({ type: 'moved', blockId: study.id, from: { start: study.start, end: study.end } });
  if (c.type !== 'moved') throw new Error('unreachable');
  expect(c.to.end - c.to.start).toBe(study.end - study.start);
  const overlapsNight = c.to.start < at(TUE, '23:45') && at(TUE, '18:45') < c.to.end;
  expect(overlapsNight).toBe(false);
  expect(out.shortfalls).toEqual([]);
  expect(violations(inp, out.changes)).toEqual([]);
});

test('partial overlap shortens a startup block when the rest is ≥ startupBlock.min', () => {
  const startup = mv(TUE, '17:00', '20:00', { category: 'startup', title: 'Startup', courseId: null });
  const inp = input({ movable: [startup], trigger: trigger(TUE, '19:30', '23:00') });
  const out = replan(inp);
  expect(out.changes).toEqual([
    { type: 'shortened', blockId: startup.id, from: { start: startup.start, end: startup.end }, to: { start: at(TUE, '17:00'), end: at(TUE, '19:15') } },
  ]);
  expect(violations(inp, out.changes)).toEqual([]);
});

test('partial overlap below min removes and re-places', () => {
  const startup = mv(TUE, '18:30', '20:00', { category: 'startup', title: 'Startup', courseId: null, startupTaskId: 't1' });
  const inp = input({
    movable: [startup],
    trigger: trigger(TUE, '19:30', '23:00'),
    startupTasks: [{ id: 't1', title: 'Pitch deck' }],
  });
  const out = replan(inp);
  expect(out.changes).toHaveLength(1);
  const c = out.changes[0]!;
  expect(c.type).toBe('moved');
  if (c.type !== 'moved') throw new Error('unreachable');
  expect(c.blockId).toBe(startup.id);
  expect(c.to.end - c.to.start).toBe(90 * 60_000);
  expect(c.to.start === startup.start).toBe(false);
  expect(violations(inp, out.changes)).toEqual([]);
});

test('gym hit by trigger is moved whole respecting 40h spacing', () => {
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({
    existing: [ref(MON, '17:00', '18:15', { category: 'workout', workoutType: 'gym' })],
    movable: [gym],
    trigger: trigger(TUE, '17:30', '18:30'),
  });
  const out = replan(inp);
  expect(out.changes).toHaveLength(1);
  const c = out.changes[0]!;
  if (c.type !== 'moved') throw new Error(`expected moved, got ${c.type}`);
  expect(c.to.end - c.to.start).toBe(75 * 60_000);
  expect(c.to.start - at(MON, '17:00')).toBeGreaterThanOrEqual(40 * 3_600_000);
  expect(violations(inp, out.changes)).toEqual([]);
});

test('gym with no room → removed + shortfall count 1', () => {
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({
    prefs: prefs({ allowedWorkoutDays: [2] }),
    movable: [gym],
    trigger: trigger(TUE, '08:00', '23:00'),
  });
  const out = replan(inp);
  expect(out.changes).toEqual([{ type: 'removed', blockId: gym.id, from: { start: gym.start, end: gym.end } }]);
  expect(out.shortfalls).toEqual([{ goal: { kind: 'workout', workoutType: 'gym', count: 1 }, missing: 1 }]);
});

test('locked/frozen blocks overlapping the trigger are untouched and not in changes', () => {
  const inp = input({
    existing: [
      ref(TUE, '20:00', '21:00', { category: 'other', source: 'fixed' }),
      ref(TUE, '21:00', '22:00', { category: 'social', source: 'quick_add' }),
    ],
    trigger: trigger(TUE, '19:00', '23:30'),
  });
  expect(replan(inp)).toEqual({ changes: [], shortfalls: [] });
});

test('non-conflicting movable blocks never appear in changes', () => {
  const inp = input({
    movable: [mv(WED, '19:00', '21:00'), mv(TUE, '09:00', '10:30'), mv(TUE, '12:00', '12:30', { category: 'meal', title: 'Lunch', courseId: null, mealSlot: 'lunch' })],
    trigger: trigger(TUE, '19:00', '23:30'),
  });
  expect(replan(inp).changes).toEqual([]);
});

test('no room for study pool → removed + shortfall minutes equal to removed minutes', () => {
  const a = mv(TUE, '09:00', '11:00');
  const b = mv(TUE, '13:00', '14:30');
  const inp = input({
    range: { start: at(TUE, '00:00'), end: at(WED, '00:00') },
    movable: [a, b],
    trigger: trigger(TUE, '08:00', '23:00'),
  });
  const out = replan(inp);
  expect(out.changes.map((c) => c.type)).toEqual(['removed', 'removed']);
  expect(out.shortfalls).toHaveLength(1);
  expect(out.shortfalls[0]!.goal).toMatchObject({ kind: 'study', courseId: 'algo', courseName: 'Algorithms' });
  expect(out.shortfalls[0]!.missing).toBe(210);
});

test('a meal with no slot nearby is removed without a shortfall; one with room moves', () => {
  const lunch = mv(TUE, '12:30', '13:00', { category: 'meal', title: 'Lunch', courseId: null, mealSlot: 'lunch' });
  const blocked = replan(input({ movable: [lunch], trigger: trigger(TUE, '12:00', '13:30') }));
  expect(blocked.changes).toEqual([{ type: 'removed', blockId: lunch.id, from: { start: lunch.start, end: lunch.end } }]);
  expect(blocked.shortfalls).toEqual([]);

  const inp = input({ movable: [lunch], trigger: trigger(TUE, '12:30', '13:00') });
  const moved = replan(inp);
  expect(moved.changes).toHaveLength(1);
  expect(moved.changes[0]!.type).toBe('moved');
  expect(violations(inp, moved.changes)).toEqual([]);
});

test('study split into more blocks than before yields moved + added', () => {
  const inp = input({
    // Tue 19:00-21:00 is the only block; Wed/Thu are limited so the 120 minutes may come back as several blocks.
    prefs: prefs({ studyBlock: { min: 45, max: 60 } }),
    movable: [mv(TUE, '19:00', '21:00')],
    trigger: trigger(TUE, '19:00', '23:30'),
  });
  const out = replan(inp);
  expect(out.changes.filter((c) => c.type === 'moved')).toHaveLength(1);
  expect(out.changes.filter((c) => c.type === 'added')).toHaveLength(1);
  expect(violations(inp, out.changes)).toEqual([]);
});

test('deterministic output', () => {
  const inp = input({
    movable: [mv(TUE, '19:00', '21:00'), mv(TUE, '21:15', '22:15', { courseId: 'db', title: 'Study — Databases' })],
    trigger: trigger(TUE, '19:00', '23:30'),
  });
  expect(JSON.stringify(replan(inp))).toBe(JSON.stringify(replan(inp)));
});

test('placeMeals onlySlots places just the requested slot', () => {
  const inp = baseInput();
  const t = createTimeline(inp);
  const out = placeMeals(t, inp, { onlySlots: [{ date: WED, slot: 'dinner' }] });
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ mealSlot: 'dinner', start: at(WED, '19:00') });
});

test('a displaced meal is re-placed around that weekday\'s own meal time', () => {
  const late = { time: '14:00', minutes: 30 };
  const p = prefs({ mealsByDay: [{ days: [2], breakfast: prefs().meals.breakfast, lunch: late, dinner: prefs().meals.dinner }] });
  const lunch = mv(TUE, '12:30', '13:00', { category: 'meal', title: 'Lunch', courseId: null, mealSlot: 'lunch' });
  const out = replan(input({ prefs: p, movable: [lunch], trigger: trigger(TUE, '12:30', '13:00') }));
  expect(out.changes).toEqual([
    { type: 'moved', blockId: lunch.id, from: { start: lunch.start, end: lunch.end }, to: { start: at(TUE, '14:00'), end: at(TUE, '14:30') } },
  ]);
});

test('a trigger inside the workout buffer moves the gym into the availability windows, with its buffer', () => {
  const THU = '2026-10-22';
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({
    prefs: prefs({ workoutAvailability: [{ days: [2, 4], start: '17:00', end: '19:30' }], workoutBuffer: { before: 15, after: 30 } }),
    movable: [gym],
    trigger: trigger(TUE, '18:30', '23:00'),
  });
  const out = replan(inp);
  expect(out.changes).toHaveLength(1);
  const c = out.changes[0]!;
  if (c.type !== 'moved') throw new Error(`expected moved, got ${c.type}`);
  expect(c.to.start).toBeGreaterThanOrEqual(at(THU, '17:00'));
  expect(c.to.end).toBeLessThanOrEqual(at(THU, '19:30'));
  expect(violations(inp, out.changes)).toEqual([]);
});

test('a trigger past the workout buffer leaves the gym alone', () => {
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({ prefs: prefs({ workoutBuffer: { before: 15, after: 30 } }), movable: [gym], trigger: trigger(TUE, '18:45', '23:00') });
  expect(replan(inp)).toEqual({ changes: [], shortfalls: [] });
});

test('gym with no room inside the availability windows → removed + shortfall', () => {
  const gym = mv(TUE, '17:00', '18:15', { category: 'workout', title: 'Gym', courseId: null, workoutType: 'gym' });
  const inp = input({
    prefs: prefs({ workoutAvailability: [{ days: [2], start: '17:00', end: '19:00' }] }),
    movable: [gym],
    trigger: trigger(TUE, '17:30', '18:00'),
  });
  const out = replan(inp);
  expect(out.changes).toEqual([{ type: 'removed', blockId: gym.id, from: { start: gym.start, end: gym.end } }]);
  expect(out.shortfalls).toEqual([{ goal: { kind: 'workout', workoutType: 'gym', count: 1 }, missing: 1 }]);
});

const relaxProject = {
  kind: 'project' as const, projectId: 'p-relax', title: 'Read a novel', category: 'rest' as const, minutes: 0,
  windows: [{ days: [2 as const], start: '20:00', end: '22:00' }], block: { min: 60, max: 60 }, priority: 2,
};

test('a displaced relax project block is moved with its own size and windows, not removed', () => {
  const read = mv(TUE, '14:00', '15:00', { category: 'rest', title: 'Read a novel', courseId: null, projectId: 'p-relax' });
  const out = replan(input({ projects: [relaxProject], movable: [read], trigger: trigger(TUE, '13:30', '15:30') }));
  expect(out.changes).toHaveLength(1);
  const ch = out.changes[0]!;
  expect(ch).toMatchObject({ type: 'moved', blockId: read.id });
  if (ch.type !== 'moved') throw new Error('expected a move');
  expect(ch.to.end - ch.to.start).toBe(60 * 60_000);
  expect(ch.to.start >= at(TUE, '20:00') && ch.to.end <= at(TUE, '22:00')).toBe(true);
});

test('a project block whose project is gone falls back to the category rules', () => {
  const read = mv(TUE, '14:00', '15:00', { category: 'rest', title: 'Read a novel', courseId: null, projectId: 'p-deleted' });
  const out = replan(input({ projects: [relaxProject], movable: [read], trigger: trigger(TUE, '13:30', '15:30') }));
  expect(out.changes).toEqual([{ type: 'removed', blockId: read.id, from: { start: read.start, end: read.end } }]);
});

test('a project block is only shortened down to its own minimum block length', () => {
  const read = mv(TUE, '14:00', '15:30', { category: 'rest', title: 'Read a novel', courseId: null, projectId: 'p-relax' });
  const out = replan(input({ projects: [relaxProject], movable: [read], trigger: trigger(TUE, '14:45', '16:00') }));
  // 14:00–14:30 is left after the trigger and buffer: shorter than the 60-minute minimum, so it moves instead.
  expect(out.changes[0]).toMatchObject({ type: 'moved', blockId: read.id });
});

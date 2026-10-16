import { localDateOf, type Category, type MealSlot, type WorkoutType } from '@life-tracker/shared';
import { placeStartup, placeStudy } from './chunked.js';
import { reserveEvenings } from './evenings.js';
import { ceilTo15, MINUTE_MS, overlaps, padIntervals, STEP_MS, subtractIntervals } from './intervals.js';
import { placeMealPrep, placeMeals } from './meals.js';
import { placeProjects } from './projects.js';
import { createTimeline } from './timeline.js';
import type {
  Interval, PlannerBlockRef, PlannerGoal, PlannerInput, ProposedBlock, Shortfall,
} from './types.js';
import { placeWorkouts, workoutPads } from './workouts.js';

export interface MovableBlock extends Interval {
  id: string;
  category: Category;
  title: string;
  courseId?: string | null;
  startupTaskId?: string | null;
  projectId?: string | null;
  workoutType?: WorkoutType | null;
  mealSlot?: MealSlot | null;
}

/** `existing` holds the frozen blocks; `goals` may only carry a `free_evenings` goal. */
export interface ReplanInput extends PlannerInput {
  movable: MovableBlock[];
  /** The week's projects (minutes unused), so displaced project blocks are re-placed with their own sizes and windows. */
  projects?: Extract<PlannerGoal, { kind: 'project' }>[];
  trigger: Interval & { title: string };
}

export type PlanChangeCore =
  | { type: 'moved'; blockId: string; from: Interval; to: Interval }
  | { type: 'shortened'; blockId: string; from: Interval; to: Interval }
  | { type: 'removed'; blockId: string; from: Interval }
  | { type: 'added'; block: ProposedBlock };

export interface ReplanOutput {
  changes: PlanChangeCore[];
  shortfalls: Shortfall[];
}

const NO_COURSE = '__none__';
const NO_TASK = '__none__';
const UNSHORTENABLE = new Set<Category>(['workout', 'meal', 'meal_prep']);

const span = (b: Interval): Interval => ({ start: b.start, end: b.end });
const minutesOf = (b: Interval): number => (b.end - b.start) / 60_000;
const byStart = (a: MovableBlock, b: MovableBlock): number => a.start - b.start || a.id.localeCompare(b.id);
const byBlockStart = (a: ProposedBlock, b: ProposedBlock): number => a.start - b.start || a.end - b.end;

function asRef(b: MovableBlock, prefs: PlannerInput['prefs'], at: Interval = b): PlannerBlockRef {
  return {
    ...(b.category === 'workout' ? workoutPads(prefs) : {}),
    start: at.start,
    end: at.end,
    category: b.category,
    source: 'planner',
    courseId: b.courseId ?? null,
    workoutType: b.workoutType ?? null,
    mealSlot: b.mealSlot ?? null,
    ...(b.projectId ? { projectId: b.projectId } : {}),
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    out.set(k, [...(out.get(k) ?? []), x]);
  }
  return out;
}

/** Keeps the 15-minute grid; the longest part of `block` left after cutting `pad`, if it is at least `min` minutes. */
function shortenedPart(block: MovableBlock, pad: Interval, min: number): Interval | null {
  let best: Interval | null = null;
  for (const part of subtractIntervals([span(block)], [pad])) {
    const aligned = { start: ceilTo15(part.start), end: Math.floor(part.end / STEP_MS) * STEP_MS };
    if (aligned.end <= aligned.start) continue;
    if (!best || aligned.end - aligned.start > best.end - best.start) best = aligned;
  }
  return best && minutesOf(best) >= min ? best : null;
}

/** Pairs removed sources with re-placed blocks in start order: moved, then added for extras, removed for leftovers. */
function pair(sources: MovableBlock[], placed: ProposedBlock[], out: PlanChangeCore[]): void {
  const ps = [...placed].sort(byBlockStart);
  sources.forEach((src, i) => {
    const p = ps[i];
    if (p) out.push({ type: 'moved', blockId: src.id, from: span(src), to: span(p) });
    else out.push({ type: 'removed', blockId: src.id, from: span(src) });
  });
  // An extra block keeps the project link when every source shares it.
  const projectId = sources[0]!.projectId;
  const link = projectId && sources.every((s) => s.projectId === projectId) ? { projectId } : {};
  for (const extra of ps.slice(sources.length)) out.push({ type: 'added', block: { ...extra, ...link, title: sources[0]!.title } });
}

/**
 * Pure, deterministic minimal-change replan: blocks that don't conflict with the trigger never move.
 * Conflicting blocks are shortened when allowed, otherwise re-placed around everything else.
 */
export function replan(input: ReplanInput): ReplanOutput {
  const { prefs, timezone: tz } = input;
  const pad = padIntervals([input.trigger], prefs.bufferMinutes)[0]!;
  const changes: PlanChangeCore[] = [];
  const kept: PlannerBlockRef[] = [];
  const pool: MovableBlock[] = [];
  const projects = new Map((input.projects ?? []).map((p) => [p.projectId, p]));
  const projectOf = (b: MovableBlock) => (b.projectId ? projects.get(b.projectId) : undefined);

  // A workout also conflicts when the trigger lands inside its own buffer.
  const reach = (b: MovableBlock): Interval => {
    if (b.category !== 'workout') return pad;
    const before = Math.max(prefs.bufferMinutes, prefs.workoutBuffer.after) * MINUTE_MS;
    const after = Math.max(prefs.bufferMinutes, prefs.workoutBuffer.before) * MINUTE_MS;
    return { start: input.trigger.start - before, end: input.trigger.end + after };
  };

  for (const b of [...input.movable].sort(byStart)) {
    if (!overlaps(b, reach(b))) {
      kept.push(asRef(b, prefs));
      continue;
    }
    if (!UNSHORTENABLE.has(b.category)) {
      const min =
        projectOf(b)?.block.min ??
        (b.category === 'study' ? prefs.studyBlock.min : b.category === 'startup' ? prefs.startupBlock.min : 15);
      const part = shortenedPart(b, pad, min);
      if (part) {
        kept.push(asRef(b, prefs, part));
        changes.push({ type: 'shortened', blockId: b.id, from: span(b), to: part });
        continue;
      }
    }
    pool.push(b);
  }

  const trigger: PlannerBlockRef = { start: input.trigger.start, end: input.trigger.end, category: 'social', source: 'quick_add' };
  const work: PlannerInput = {
    range: input.range,
    timezone: tz,
    prefs,
    existing: [...input.existing, ...kept, trigger],
    busy: input.busy,
    goals: input.goals.filter((g) => g.kind === 'free_evenings'),
    startupTasks: input.startupTasks,
  };
  const t = createTimeline(work);
  const evenings = reserveEvenings(t, work);
  const shortfalls: Shortfall[] = evenings.shortfall ? [evenings.shortfall] : [];

  // Meals: a meal that finds no slot is dropped without a shortfall.
  for (const m of pool.filter((b) => b.category === 'meal')) {
    const slot = m.mealSlot;
    const placed = slot
      ? placeMeals(t, work, { onlySlots: [{ date: localDateOf(new Date(m.start), tz), slot }] })
      : [];
    pair([m], placed, changes);
  }

  // Meal prep: same, no shortfall.
  for (const m of pool.filter((b) => b.category === 'meal_prep')) pair([m], placeMealPrep(t, work), changes);

  // Workouts: one goal of count 1 each.
  for (const w of pool.filter((b) => b.category === 'workout')) {
    const goal: PlannerGoal = { kind: 'workout', workoutType: w.workoutType ?? 'gym', count: 1 };
    const r = placeWorkouts(t, { ...work, goals: [goal] });
    shortfalls.push(...r.shortfalls);
    pair([w], r.blocks, changes);
  }

  // Projects: re-placed with their own block sizes and windows; relax may use reserved evenings.
  for (const [projectId, bs] of groupBy(pool.filter((b) => projectOf(b)), (b) => b.projectId!)) {
    const goal = { ...projects.get(projectId)!, minutes: bs.reduce((n, b) => n + minutesOf(b), 0) };
    const r = placeProjects(t, { ...work, goals: [goal] }, evenings.reservedIntervals);
    shortfalls.push(...r.shortfalls);
    pair(bs, r.blocks, changes);
  }
  const others = pool.filter((b) => !projectOf(b));

  // Study: one goal per course; blocks pair per course in start order.
  const study = others.filter((b) => b.category === 'study');
  if (study.length > 0) {
    const byCourse = groupBy(study, (b) => b.courseId ?? NO_COURSE);
    const goals: PlannerGoal[] = [...byCourse].map(([courseId, bs]) => ({
      kind: 'study',
      courseId,
      courseName: bs[0]!.title.replace(/^Study — /, ''),
      minutes: bs.reduce((n, b) => n + minutesOf(b), 0),
    }));
    const r = placeStudy(t, { ...work, goals }, evenings.reservedIntervals);
    shortfalls.push(...r.shortfalls);
    for (const [courseId, bs] of byCourse) {
      const placed = r.blocks
        .filter((p) => p.courseId === courseId)
        .map((p) => (courseId === NO_COURSE ? { ...p, courseId: undefined } : p));
      pair(bs, placed, changes);
    }
  }

  // Startup: placed per task (or taskless) in turn, so each block keeps its task.
  const startup = others.filter((b) => b.category === 'startup');
  for (const [key, bs] of groupBy(startup, (b) => b.startupTaskId ?? NO_TASK)) {
    const first = bs[0]!;
    const task =
      key === NO_TASK
        ? null
        : (input.startupTasks.find((x) => x.id === key) ?? { id: key, title: first.title.replace(/^Startup — /, '') });
    const goal: PlannerGoal = { kind: 'startup', minutes: bs.reduce((n, b) => n + minutesOf(b), 0) };
    const r = placeStartup(t, { ...work, goals: [goal], startupTasks: task ? [task] : [] }, evenings.reservedIntervals);
    shortfalls.push(...r.shortfalls);
    pair(bs, r.blocks, changes);
  }

  // Categories without a placer (rest, social, ...) can only be kept, shortened or dropped.
  for (const b of others.filter((x) => !['meal', 'meal_prep', 'workout', 'study', 'startup'].includes(x.category))) {
    changes.push({ type: 'removed', blockId: b.id, from: span(b) });
  }

  const startOf = (c: PlanChangeCore): number => (c.type === 'added' ? c.block.start : c.from.start);
  const idOf = (c: PlanChangeCore): string => (c.type === 'added' ? '' : c.blockId);
  changes.sort((a, b) => startOf(a) - startOf(b) || idOf(a).localeCompare(idOf(b)));
  return { changes, shortfalls };
}

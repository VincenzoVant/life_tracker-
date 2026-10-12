import { isoWeekday } from '@life-tracker/shared';
import { localWindow } from './days.js';
import { ceilTo15 } from './intervals.js';
import { pickBest, scoreCandidate } from './score.js';
import type { DayLoad, Timeline } from './timeline.js';
import type { Interval, PlannerGoal, PlannerInput, ProposedBlock, Shortfall } from './types.js';

const STEP_MIN = 15;
const ceil15Min = (m: number): number => ceilTo15(m * 60_000) / 60_000;

/** Size of the next block for `remaining` minutes, keeping the leftover usable (>= min) or zero. */
export function nextChunk(remaining: number, min: number, max: number): number {
  if (remaining <= max) return Math.max(ceil15Min(remaining), min);
  if (remaining - max < min) return ceil15Min(remaining - min);
  return max;
}

interface Item {
  key: string;
  goal: PlannerGoal;
  remaining: number;
}

interface Hooks {
  block: { min: number; max: number };
  fits(load: DayLoad, minutes: number, item: Item): boolean;
  preferred(date: string): Interval[];
  dayLoad(load: DayLoad, item: Item): number;
  make(item: Item, c: Interval, index: number): ProposedBlock;
}

function placeItems(
  t: Timeline,
  input: PlannerInput,
  items: Item[],
  exclude: Interval[],
  hooks: Hooks,
): { blocks: ProposedBlock[]; shortfalls: Shortfall[] } {
  const { block } = hooks;
  const blocks: ProposedBlock[] = [];
  const shortfalls = new Map<string, Shortfall>();
  const hasPreferred = t.days.some((d) => hooks.preferred(d.date).length > 0);
  const active = new Map(items.filter((i) => i.remaining > 0).map((i) => [i.key, i]));

  while (active.size > 0) {
    const item = [...active.values()].sort((a, b) => b.remaining - a.remaining || a.key.localeCompare(b.key))[0]!;
    const chunk = Math.max(nextChunk(item.remaining, block.min, block.max), block.min);

    type Option = Interval & { date: string; preferred: Interval[]; load: DayLoad };
    const inPreferred = (c: Interval, preferred: Interval[]) => preferred.some((p) => c.start >= p.start && c.end <= p.end);
    const bestAt = (minutes: number): { best: Interval; preferred: boolean } | null => {
      const options: Option[] = [];
      for (const day of t.days) {
        const load = t.load(day.date);
        if (!hooks.fits(load, minutes, item)) continue;
        const preferred = hooks.preferred(day.date);
        for (const c of t.candidates(day.date, minutes, { exclude })) options.push({ ...c, date: day.date, preferred, load });
      }
      const best = pickBest(options, (c) => {
        const o = c as Option;
        return scoreCandidate(o, {
          preferred: o.preferred,
          dayLoadSameCategory: hooks.dayLoad(o.load, item),
          free: t.freeIntervals(o.date),
          minGap: block.min,
          tz: input.timezone,
        });
      }) as Option | null;
      return best ? { best: { start: best.start, end: best.end }, preferred: inPreferred(best, best.preferred) } : null;
    };

    // Largest size that fits wins, unless a smaller size (down to min, 15-minute steps) fits inside a preferred window.
    let choice: Interval | null = null;
    for (let minutes = chunk; minutes >= block.min; minutes -= STEP_MIN) {
      const found = bestAt(minutes);
      if (!found) continue;
      if (found.preferred || !hasPreferred) {
        choice = found.best;
        break;
      }
      choice ??= found.best;
    }
    const placed = choice !== null;
    if (choice) {
      const made = hooks.make(item, choice, blocks.length);
      t.occupy(made);
      blocks.push(made);
      item.remaining -= (choice.end - choice.start) / 60_000;
    }

    if (!placed) {
      shortfalls.set(item.key, { goal: item.goal, missing: item.remaining });
      active.delete(item.key);
    } else if (item.remaining <= 0) {
      active.delete(item.key);
    }
  }

  return { blocks, shortfalls: items.flatMap((i) => (shortfalls.has(i.key) ? [shortfalls.get(i.key)!] : [])) };
}

export function placeStudy(
  t: Timeline,
  input: PlannerInput,
  exclude: Interval[],
): { blocks: ProposedBlock[]; shortfalls: Shortfall[] } {
  const { prefs } = input;
  const items = new Map<string, Item>();
  for (const g of input.goals) {
    if (g.kind !== 'study') continue;
    const existing = items.get(g.courseId);
    if (existing) existing.remaining += g.minutes;
    else items.set(g.courseId, { key: g.courseId, goal: g, remaining: g.minutes });
  }
  const names = new Map(
    input.goals.flatMap((g) => (g.kind === 'study' ? [[g.courseId, g.courseName] as const] : [])),
  );
  return placeItems(t, input, [...items.values()], exclude, {
    block: prefs.studyBlock,
    fits: (load, m, item) =>
      load.study + m <= prefs.maxStudyMinutesPerDay &&
      (load.perCourse[item.key] ?? 0) + m <= prefs.maxMinutesPerCoursePerDay &&
      load.planned + m <= prefs.maxPlannedMinutesPerDay,
    preferred: () => [],
    dayLoad: (load, item) => load.perCourse[item.key] ?? 0,
    make: (item, c) => ({
      category: 'study',
      title: `Study — ${names.get(item.key)}`,
      courseId: item.key,
      start: c.start,
      end: c.end,
    }),
  });
}

export function placeStartup(
  t: Timeline,
  input: PlannerInput,
  exclude: Interval[],
): { blocks: ProposedBlock[]; shortfalls: Shortfall[] } {
  const { prefs, startupTasks, timezone: tz } = input;
  const goals = input.goals.filter((g): g is Extract<PlannerGoal, { kind: 'startup' }> => g.kind === 'startup');
  if (goals.length === 0) return { blocks: [], shortfalls: [] };
  const item: Item = { key: 'startup', goal: goals[0]!, remaining: goals.reduce((n, g) => n + g.minutes, 0) };
  return placeItems(t, input, [item], exclude, {
    block: prefs.startupBlock,
    fits: (load, m) => load.planned + m <= prefs.maxPlannedMinutesPerDay,
    preferred: (date) =>
      prefs.preferredStartupWindows.filter((w) => w.days.includes(isoWeekday(date))).map((w) => localWindow(date, w, tz)),
    dayLoad: (load) => load.startup,
    make: (_item, c, index) => {
      const task = startupTasks.length > 0 ? startupTasks[index % startupTasks.length]! : null;
      return {
        category: 'startup',
        title: task ? `Startup — ${task.title}` : 'Startup',
        ...(task ? { startupTaskId: task.id } : {}),
        start: c.start,
        end: c.end,
      };
    },
  });
}

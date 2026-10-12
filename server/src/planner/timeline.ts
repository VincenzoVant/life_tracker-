import { localDateOf } from '@life-tracker/shared';
import { buildDayWindows, type DayWindow } from './days.js';
import { ceilTo15, mergeIntervals, padIntervals, STEP_MS, subtractIntervals } from './intervals.js';
import type { Interval, Ms, PlannerInput, ProposedBlock } from './types.js';

export interface DayLoad {
  planned: number;
  study: number;
  perCourse: Record<string, number>;
  startup: number;
  workouts: number;
}

export interface Timeline {
  days: DayWindow[];
  freeIntervals(date: string): Interval[];
  candidates(date: string, minutes: number, opts?: { within?: Interval; exclude?: Interval[] }): Interval[];
  occupy(block: ProposedBlock): void;
  load(date: string): DayLoad;
  gymStarts(): Ms[];
}

interface LoadShape {
  category: string;
  source?: string;
  courseId?: string | null;
  start: Ms;
  end: Ms;
}

const emptyLoad = (): DayLoad => ({ planned: 0, study: 0, perCourse: {}, startup: 0, workouts: 0 });

export function createTimeline(input: PlannerInput): Timeline {
  const { prefs, timezone: tz } = input;
  const days = buildDayWindows(input.range, tz, prefs);
  const raw: Interval[] = [...input.existing, ...input.busy].map((x) => ({ start: x.start, end: x.end }));
  let occupied = mergeIntervals(padIntervals(raw, prefs.bufferMinutes));
  const loads = new Map<string, DayLoad>();
  const gyms: Ms[] = [];

  const addLoad = (b: LoadShape): void => {
    const date = localDateOf(new Date(b.start), tz);
    const l = loads.get(date) ?? emptyLoad();
    loads.set(date, l);
    const minutes = (b.end - b.start) / 60_000;
    if (b.category !== 'meal' && b.source !== 'fixed') l.planned += minutes;
    if (b.source !== 'fixed') {
      if (b.category === 'study') {
        l.study += minutes;
        if (b.courseId) l.perCourse[b.courseId] = (l.perCourse[b.courseId] ?? 0) + minutes;
      }
      if (b.category === 'startup') l.startup += minutes;
    }
    if (b.category === 'workout') l.workouts += 1;
  };

  for (const e of input.existing) {
    addLoad(e);
    if (e.category === 'workout' && e.workoutType === 'gym') gyms.push(e.start);
  }

  const freeIntervals = (date: string): Interval[] => {
    const w = days.find((d) => d.date === date);
    return w ? subtractIntervals([{ start: w.start, end: w.end }], occupied) : [];
  };

  return {
    days,
    freeIntervals,
    candidates(date, minutes, opts = {}) {
      let free = freeIntervals(date);
      if (opts.within) {
        const within = opts.within;
        free = free
          .map((f) => ({ start: Math.max(f.start, within.start), end: Math.min(f.end, within.end) }))
          .filter((f) => f.end > f.start);
      }
      if (opts.exclude?.length) free = subtractIntervals(free, opts.exclude);
      const len = minutes * 60_000;
      const out: Interval[] = [];
      for (const f of free) {
        for (let s = ceilTo15(f.start); s + len <= f.end; s += STEP_MS) out.push({ start: s, end: s + len });
      }
      return out;
    },
    occupy(block) {
      occupied = mergeIntervals([...occupied, ...padIntervals([block], prefs.bufferMinutes)]);
      addLoad(block);
      if (block.category === 'workout' && block.workoutType === 'gym') gyms.push(block.start);
    },
    load(date) {
      const l = loads.get(date) ?? emptyLoad();
      return { ...l, perCourse: { ...l.perCourse } };
    },
    gymStarts: () => [...gyms].sort((a, b) => a - b),
  };
}

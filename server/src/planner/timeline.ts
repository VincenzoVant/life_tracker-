import { localDateOf } from '@life-tracker/shared';
import { buildDayWindows, type DayWindow } from './days.js';
import { ceilTo15, MINUTE_MS, STEP_MS, subtractIntervals } from './intervals.js';
import type { Interval, Ms, Pads, PlannerInput, ProposedBlock } from './types.js';

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
  /** Start times (15-minute steps) where a block of `minutes` fits; `pad` is the new block's own buffer. */
  candidates(date: string, minutes: number, opts?: { within?: Interval; exclude?: Interval[]; pad?: Pads }): Interval[];
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
  const side = (m: number | undefined): Ms => (m ?? prefs.bufferMinutes) * MINUTE_MS;
  interface Taken extends Interval {
    before: Ms;
    after: Ms;
  }
  const taken = (x: Interval & Pads): Taken => ({ start: x.start, end: x.end, before: side(x.padBefore), after: side(x.padAfter) });
  const occupied: Taken[] = [...input.existing.map(taken), ...input.busy.map((b) => taken(b))];
  /** Occupied intervals widened by the larger facing buffer, as seen by a new block with `pad`. */
  const blocked = (pad: Pads = {}): Interval[] => {
    const before = side(pad.padBefore);
    const after = side(pad.padAfter);
    return occupied.map((o) => ({ start: o.start - Math.max(o.before, after), end: o.end + Math.max(o.after, before) }));
  };
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

  const freeFor = (date: string, pad?: Pads): Interval[] => {
    const w = days.find((d) => d.date === date);
    return w ? subtractIntervals([{ start: w.start, end: w.end }], blocked(pad)) : [];
  };
  const freeIntervals = (date: string): Interval[] => freeFor(date);

  return {
    days,
    freeIntervals,
    candidates(date, minutes, opts = {}) {
      let free = freeFor(date, opts.pad);
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
      occupied.push(taken(block));
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

import { eveningWindowUtc, isoWeekday, localDateOf } from '@life-tracker/shared';
import { buildDayWindows } from '../../src/planner/days.js';
import type { Interval, PlannerInput, PlannerOutput, ProposedBlock } from '../../src/planner/types.js';

const MIN = 60_000;
const STEP = 15 * MIN;

/** Duration the preferences configure for a block's kind, when it has one (these need not be multiples of 15). */
function configuredMinutes(input: PlannerInput, b: ProposedBlock): number | null {
  const { prefs } = input;
  if (b.category === 'meal' && b.mealSlot && b.mealSlot !== 'snack') return prefs.meals[b.mealSlot].minutes;
  if (b.category === 'meal_prep') return prefs.mealPrep.minutes;
  if (b.category === 'workout' && b.workoutType) return prefs.workoutDurations[b.workoutType];
  return null;
}

const label = (b: ProposedBlock, tz: string) => `${b.title}@${localDateOf(new Date(b.start), tz)}`;

/** Returns a list of violated planner invariants; an empty array means the output is valid. */
export function checkInvariants(input: PlannerInput, output: PlannerOutput): string[] {
  const errs: string[] = [];
  const { prefs, timezone: tz, range } = input;
  const windows = buildDayWindows(range, tz, prefs);
  const buf = prefs.bufferMinutes * MIN;
  const blocks = output.blocks;

  for (const b of blocks) {
    const name = label(b, tz);
    const w = windows.find((d) => d.date === localDateOf(new Date(b.start), tz));
    if (!w || b.start < w.start || b.end > w.end) errs.push(`${name}: outside day window`);
    if (b.start < range.start || b.end > range.end) errs.push(`${name}: outside range`);
    if (b.end <= b.start) errs.push(`${name}: empty block`);
    if (b.start % STEP !== 0) errs.push(`${name}: start not on a 15-minute boundary`);
    if (b.end % STEP !== 0 && (b.end - b.start) / MIN !== configuredMinutes(input, b)) {
      errs.push(`${name}: end not on a 15-minute boundary`);
    }
    if (b.category === 'workout' && b.workoutType && !prefs.allowedWorkoutDays.includes(isoWeekday(localDateOf(new Date(b.start), tz)))) {
      errs.push(`${name}: workout on a day that is not allowed`);
    }
  }

  const gap = (a: Interval, b: Interval) => a.start < b.end + buf && b.start < a.end + buf;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (gap(blocks[i]!, blocks[j]!)) errs.push(`${label(blocks[i]!, tz)} and ${label(blocks[j]!, tz)}: closer than buffer or overlapping`);
    }
    for (const e of input.existing) if (gap(blocks[i]!, e)) errs.push(`${label(blocks[i]!, tz)}: too close to an existing block`);
    for (const e of input.busy) if (gap(blocks[i]!, e)) errs.push(`${label(blocks[i]!, tz)}: too close to a busy interval`);
  }

  // Per-day caps: existing load plus proposed load must not exceed a cap the planner contributed to.
  const dates = new Set(blocks.map((b) => localDateOf(new Date(b.start), tz)));
  for (const date of dates) {
    const sum = (xs: { category: string; source?: string; courseId?: string | null; start: number; end: number }[]) => {
      const r = { planned: 0, study: 0, perCourse: {} as Record<string, number> };
      for (const x of xs) {
        if (localDateOf(new Date(x.start), tz) !== date) continue;
        const m = (x.end - x.start) / MIN;
        if (x.category !== 'meal' && x.source !== 'fixed') r.planned += m;
        if (x.category === 'study' && x.source !== 'fixed') {
          r.study += m;
          if (x.courseId) r.perCourse[x.courseId] = (r.perCourse[x.courseId] ?? 0) + m;
        }
      }
      return r;
    };
    const mine = sum(blocks);
    const total = sum([...input.existing, ...blocks]);
    if (mine.planned > 0 && total.planned > prefs.maxPlannedMinutesPerDay) errs.push(`${date}: planned minutes ${total.planned} over cap`);
    if (mine.study > 0 && total.study > prefs.maxStudyMinutesPerDay) errs.push(`${date}: study minutes ${total.study} over cap`);
    for (const [course, m] of Object.entries(total.perCourse)) {
      if ((mine.perCourse[course] ?? 0) > 0 && m > prefs.maxMinutesPerCoursePerDay) errs.push(`${date}: course ${course} minutes ${m} over cap`);
    }
  }

  const reserved = output.reservedEvenings.map((d) => {
    const w = eveningWindowUtc(d, prefs, tz);
    return { start: w.start.getTime(), end: w.end.getTime() };
  });
  for (const b of blocks) {
    if ((b.category === 'study' || b.category === 'startup') && reserved.some((r) => b.start < r.end && r.start < b.end)) {
      errs.push(`${label(b, tz)}: inside a reserved evening`);
    }
  }

  const gymStarts = [
    ...input.existing.filter((e) => e.category === 'workout' && e.workoutType === 'gym').map((e) => e.start),
    ...blocks.filter((b) => b.workoutType === 'gym').map((b) => b.start),
  ];
  const minGap = prefs.minHoursBetweenGym * 3_600_000;
  for (const b of blocks.filter((x) => x.workoutType === 'gym')) {
    for (const g of gymStarts) {
      if (g !== b.start && Math.abs(g - b.start) < minGap) errs.push(`${label(b, tz)}: gym spacing under ${prefs.minHoursBetweenGym}h`);
    }
  }
  return errs;
}

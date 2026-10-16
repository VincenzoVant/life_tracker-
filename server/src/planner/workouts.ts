import { addDays, isoWeekday, type WorkoutType } from '@life-tracker/shared';
import { localWindow } from './days.js';
import { pickBest, scoreCandidate } from './score.js';
import type { Timeline } from './timeline.js';
import type { Interval, Pads, PlannerGoal, PlannerInput, ProposedBlock, Shortfall } from './types.js';

const TYPES: WorkoutType[] = ['gym', 'cardio', 'sport'];
const TITLES: Record<WorkoutType, string> = { gym: 'Gym', cardio: 'Cardio', sport: 'Sport' };
const HOUR_MS = 3_600_000;

/** The buffer every workout keeps around itself (getting there, changing, showering). */
export const workoutPads = (prefs: PlannerInput['prefs']): Pads => ({
  padBefore: prefs.workoutBuffer.before,
  padAfter: prefs.workoutBuffer.after,
});

export function placeWorkouts(t: Timeline, input: PlannerInput): { blocks: ProposedBlock[]; shortfalls: Shortfall[] } {
  const { prefs, timezone: tz } = input;
  const blocks: ProposedBlock[] = [];
  const shortfalls: Shortfall[] = [];
  const pad = workoutPads(prefs);

  for (const type of TYPES) {
    const goals = input.goals.filter(
      (g): g is Extract<PlannerGoal, { kind: 'workout' }> => g.kind === 'workout' && g.workoutType === type,
    );
    if (goals.length === 0) continue;
    const wanted = goals.reduce((n, g) => n + g.count, 0);
    const minutes = prefs.workoutDurations[type];
    let placed = 0;

    while (placed < wanted) {
      type Option = Interval & { date: string };
      const options: Option[] = [];
      const meta = new Map<number, { date: string; preferred: Interval[]; extra: number }>();
      for (const day of t.days) {
        if (!prefs.allowedWorkoutDays.includes(isoWeekday(day.date))) continue;
        if (t.load(day.date).planned + minutes > prefs.maxPlannedMinutesPerDay) continue;
        const preferred = prefs.preferredWorkoutWindows
          .filter((w) => w.days.includes(isoWeekday(day.date)))
          .map((w) => localWindow(day.date, w, tz));
        const extra =
          10 * t.load(day.date).workouts +
          3 * (t.load(addDays(day.date, -1)).workouts + t.load(addDays(day.date, 1)).workouts);
        const gyms = type === 'gym' ? t.gymStarts() : [];
        // Availability is hard: with windows set, a workout only goes inside one that covers this weekday.
        const available = prefs.workoutAvailability.filter((w) => w.days.includes(isoWeekday(day.date)));
        const within: (Interval | undefined)[] = prefs.workoutAvailability.length === 0
          ? [undefined]
          : available.map((w) => localWindow(day.date, w, tz));
        const cands = within.flatMap((w) => t.candidates(day.date, minutes, { pad, ...(w ? { within: w } : {}) }));
        for (const c of cands) {
          if (meta.has(c.start)) continue;
          if (gyms.some((g) => Math.abs(c.start - g) < prefs.minHoursBetweenGym * HOUR_MS)) continue;
          options.push({ ...c, date: day.date });
          meta.set(c.start, { date: day.date, preferred, extra });
        }
      }
      const best = pickBest(options, (c) => {
        const o = c as Option;
        const m = meta.get(o.start)!;
        return scoreCandidate(o, {
          preferred: m.preferred,
          dayLoadSameCategory: 0,
          free: t.freeIntervals(o.date),
          minGap: 30,
          tz,
          extraPenalty: m.extra,
        });
      });
      if (!best) break;
      const block: ProposedBlock = {
        category: 'workout', title: TITLES[type], workoutType: type, start: best.start, end: best.end, ...pad,
      };
      t.occupy(block);
      blocks.push(block);
      placed += 1;
    }

    if (placed < wanted) shortfalls.push({ goal: goals[0]!, missing: wanted - placed });
  }
  return { blocks, shortfalls };
}

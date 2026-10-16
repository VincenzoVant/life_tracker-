import { isoWeekday, localDateOf } from '@life-tracker/shared';
import { nextChunk } from './chunked.js';
import { localWindow } from './days.js';
import { mergeIntervals } from './intervals.js';
import { pickBest, scoreCandidate } from './score.js';
import type { DayLoad, Timeline } from './timeline.js';
import type { Interval, PlannerGoal, PlannerInput, ProposedBlock, Shortfall } from './types.js';

type ProjectGoal = Extract<PlannerGoal, { kind: 'project' }>;

interface Item {
  goal: ProjectGoal;
  remaining: number;
}

const STEP_MIN = 15;

/**
 * Places the week's projects (Areas → This week), highest priority first, then the one with the most time left.
 * Each project uses its own block sizes and prefers its own windows. Relax projects (category `rest`) skip the daily
 * planned cap (rest is not counted as planned work) and may go into reserved free evenings; every other project
 * stays out of them. Study projects also respect the daily study and per-course caps and the study windows.
 */
export function placeProjects(
  t: Timeline,
  input: PlannerInput,
  reservedEvenings: Interval[],
): { blocks: ProposedBlock[]; shortfalls: Shortfall[] } {
  const { prefs, timezone: tz } = input;
  const items = new Map<string, Item>();
  for (const g of input.goals) {
    if (g.kind !== 'project') continue;
    const existing = items.get(g.projectId);
    if (existing) existing.remaining += g.minutes;
    else items.set(g.projectId, { goal: g, remaining: g.minutes });
  }

  // Minutes per project per local date, to spread a project over the week.
  const perDay = new Map<string, number>();
  const addDay = (projectId: string, b: Interval) => {
    const k = `${projectId}|${localDateOf(new Date(b.start), tz)}`;
    perDay.set(k, (perDay.get(k) ?? 0) + (b.end - b.start) / 60_000);
  };
  for (const e of input.existing) if (e.projectId) addDay(e.projectId, e);

  const blocks: ProposedBlock[] = [];
  const shortfalls = new Map<string, Shortfall>();
  const active = [...items.values()].filter((i) => i.remaining > 0);

  while (active.length > 0) {
    active.sort(
      (a, b) => a.goal.priority - b.goal.priority || b.remaining - a.remaining || a.goal.projectId.localeCompare(b.goal.projectId),
    );
    const item = active[0]!;
    const { goal } = item;
    const { min, max } = goal.block;
    const relax = goal.category === 'rest';
    const exclude = relax ? [] : reservedEvenings;
    const study = goal.category === 'study';
    // Study projects follow the study hours: only inside the study windows, and the preferred study times when
    // the project has none of its own.
    const softWindows = goal.windows.length > 0 || !study ? goal.windows : prefs.preferredStudyWindows;
    const hasPreferred = softWindows.length > 0;
    const windowsOn = (date: string, ws: typeof goal.windows): Interval[] =>
      mergeIntervals(ws.filter((w) => w.days.includes(isoWeekday(date))).map((w) => localWindow(date, w, tz)));
    const preferredOn = (date: string): Interval[] => windowsOn(date, softWindows);
    const hardOn = study && prefs.studyWindows.length > 0 ? (date: string) => windowsOn(date, prefs.studyWindows) : null;
    const fits = (load: DayLoad, m: number): boolean => {
      if (relax) return true;
      if (load.planned + m > prefs.maxPlannedMinutesPerDay) return false;
      if (!study) return true;
      if (load.study + m > prefs.maxStudyMinutesPerDay) return false;
      return !goal.courseId || (load.perCourse[goal.courseId] ?? 0) + m <= prefs.maxMinutesPerCoursePerDay;
    };

    type Option = Interval & { date: string; preferred: Interval[] };
    const inPreferred = (c: Interval, preferred: Interval[]) => preferred.some((p) => c.start >= p.start && c.end <= p.end);
    const bestAt = (minutes: number): { best: Interval; preferred: boolean } | null => {
      const options: Option[] = [];
      for (const day of t.days) {
        if (!fits(t.load(day.date), minutes)) continue;
        const preferred = preferredOn(day.date);
        const cands = hardOn
          ? hardOn(day.date).flatMap((w) => t.candidates(day.date, minutes, { within: w, exclude }))
          : t.candidates(day.date, minutes, { exclude });
        for (const c of cands) options.push({ ...c, date: day.date, preferred });
      }
      const best = pickBest(options, (c) => {
        const o = c as Option;
        return scoreCandidate(o, {
          preferred: o.preferred,
          dayLoadSameCategory: perDay.get(`${goal.projectId}|${o.date}`) ?? 0,
          free: t.freeIntervals(o.date),
          minGap: min,
          tz,
        });
      }) as Option | null;
      return best ? { best: { start: best.start, end: best.end }, preferred: inPreferred(best, best.preferred) } : null;
    };

    // Largest size that fits wins, unless a smaller size (down to min) fits inside a preferred window.
    let choice: Interval | null = null;
    for (let minutes = Math.max(nextChunk(item.remaining, min, max), min); minutes >= min; minutes -= STEP_MIN) {
      const found = bestAt(minutes);
      if (!found) continue;
      if (found.preferred || !hasPreferred) {
        choice = found.best;
        break;
      }
      choice ??= found.best;
    }

    if (!choice) {
      shortfalls.set(goal.projectId, { goal, missing: item.remaining });
      active.shift();
      continue;
    }
    const made: ProposedBlock = {
      category: goal.category,
      title: goal.title,
      projectId: goal.projectId,
      ...(study && goal.courseId ? { courseId: goal.courseId } : {}),
      start: choice.start,
      end: choice.end,
    };
    t.occupy(made);
    addDay(goal.projectId, made);
    blocks.push(made);
    item.remaining -= (choice.end - choice.start) / 60_000;
    if (item.remaining <= 0) active.shift();
  }

  return { blocks, shortfalls: [...items.keys()].flatMap((k) => (shortfalls.has(k) ? [shortfalls.get(k)!] : [])) };
}

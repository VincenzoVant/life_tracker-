import { z } from 'zod';
import { addDays, zonedToUtc } from '../time.js';

const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
const Weekday = z.number().int().min(1).max(7);
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TimeWindowSchema = z.object({
  days: z.array(Weekday).min(1),
  start: HHmm,
  end: HHmm,
});
export type TimeWindow = { days: Weekday[]; start: string; end: string };

const BlockRange = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
});
const MealCfg = z.object({ time: HHmm, minutes: z.number().int().positive() });

export const DEFAULT_PREFERENCES = {
  sleep: { start: '23:30', end: '07:30' },
  earliestBlock: '08:00',
  latestBlockEnd: '22:30',
  bufferMinutes: 15,
  maxPlannedMinutesPerDay: 480,
  studyBlock: { min: 45, max: 120 },
  maxStudyMinutesPerDay: 300,
  maxMinutesPerCoursePerDay: 180,
  startupBlock: { min: 60, max: 180 },
  preferredStartupWindows: [
    { days: [1, 2, 3, 4, 5], start: '19:00', end: '22:30' },
    { days: [6, 7], start: '09:00', end: '13:00' },
  ] as TimeWindow[],
  workoutDurations: { gym: 75, cardio: 45, sport: 90 },
  preferredWorkoutWindows: [{ days: [1, 3, 5], start: '17:00', end: '19:00' }] as TimeWindow[],
  allowedWorkoutDays: [1, 2, 3, 4, 5, 6, 7] as Weekday[],
  minHoursBetweenGym: 40,
  meals: {
    breakfast: { time: '08:00', minutes: 20 },
    lunch: { time: '12:30', minutes: 30 },
    dinner: { time: '19:00', minutes: 45 },
  },
  mealFlexMinutes: 60,
  mealPrep: { day: 7 as Weekday, preferredStart: '16:00', minutes: 90 },
  eveningStart: '19:00',
  reviewPromptTime: '20:00',
  protectedEvenings: [] as Weekday[],
  classesCountTowardStudy: false,
};

const D = DEFAULT_PREFERENCES;
const Windows = (def: TimeWindow[]) => z.array(TimeWindowSchema).default(structuredClone(def));

export const PreferencesSchema = z
  .object({
    sleep: z.object({ start: HHmm, end: HHmm }).default({ ...D.sleep }),
    earliestBlock: HHmm.default(D.earliestBlock),
    latestBlockEnd: HHmm.default(D.latestBlockEnd),
    bufferMinutes: z.number().int().min(0).default(D.bufferMinutes),
    maxPlannedMinutesPerDay: z.number().int().positive().default(D.maxPlannedMinutesPerDay),
    studyBlock: BlockRange.default({ ...D.studyBlock }),
    maxStudyMinutesPerDay: z.number().int().positive().default(D.maxStudyMinutesPerDay),
    maxMinutesPerCoursePerDay: z.number().int().positive().default(D.maxMinutesPerCoursePerDay),
    startupBlock: BlockRange.default({ ...D.startupBlock }),
    preferredStartupWindows: Windows(D.preferredStartupWindows),
    workoutDurations: z
      .object({
        gym: z.number().int().positive(),
        cardio: z.number().int().positive(),
        sport: z.number().int().positive(),
      })
      .default({ ...D.workoutDurations }),
    preferredWorkoutWindows: Windows(D.preferredWorkoutWindows),
    allowedWorkoutDays: z.array(Weekday).default([...D.allowedWorkoutDays]),
    minHoursBetweenGym: z.number().min(0).default(D.minHoursBetweenGym),
    meals: z
      .object({ breakfast: MealCfg, lunch: MealCfg, dinner: MealCfg })
      .default(structuredClone(D.meals)),
    mealFlexMinutes: z.number().int().min(0).default(D.mealFlexMinutes),
    mealPrep: z
      .object({ day: Weekday, preferredStart: HHmm, minutes: z.number().int().positive() })
      .default({ ...D.mealPrep }),
    eveningStart: HHmm.default(D.eveningStart),
    reviewPromptTime: HHmm.default(D.reviewPromptTime),
    protectedEvenings: z.array(Weekday).default([]),
    classesCountTowardStudy: z.boolean().default(D.classesCountTowardStudy),
  })
  .superRefine((p, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const orderOk = p.earliestBlock < p.latestBlockEnd;
    if (!orderOk) issue(['earliestBlock'], 'earliestBlock must be before latestBlockEnd');
    for (const key of ['studyBlock', 'startupBlock'] as const) {
      const { min, max } = p[key];
      if (min > max) issue([key, 'min'], 'min must not exceed max');
      else if (min % 15 !== 0) issue([key, 'min'], 'min must be a multiple of 15');
      if (max % 15 !== 0) issue([key, 'max'], 'max must be a multiple of 15');
    }
    for (const key of ['preferredStartupWindows', 'preferredWorkoutWindows'] as const) {
      p[key].forEach((w, i) => {
        if (w.start >= w.end) issue([key, i, 'start'], 'start must be before end');
      });
    }
    if (orderOk) {
      // UTC has no DST, so this measures the plain wall-clock span of a day.
      const b = dayBoundsUtc('2026-01-14', p as unknown as Preferences, 'UTC');
      if ((b.end.getTime() - b.start.getTime()) / 60_000 < 60) {
        issue(['latestBlockEnd'], 'Preferences leave less than an hour per day');
      }
    }
  });
export type Preferences = z.infer<typeof PreferencesSchema>;

type DayPrefs = Pick<Preferences, 'sleep' | 'earliestBlock' | 'latestBlockEnd' | 'eveningStart'>;

/** Bedtime at or before earliestBlock (e.g. 00:30) belongs to the next local date. */
export function sleepStartUtc(date: string, prefs: Pick<DayPrefs, 'sleep' | 'earliestBlock'>, tz: string): Date {
  return prefs.sleep.start <= prefs.earliestBlock
    ? zonedToUtc(addDays(date, 1), prefs.sleep.start, tz)
    : zonedToUtc(date, prefs.sleep.start, tz);
}

export function dayBoundsUtc(date: string, prefs: DayPrefs, tz: string): { start: Date; end: Date } {
  const start = Math.max(
    zonedToUtc(date, prefs.sleep.end, tz).getTime(),
    zonedToUtc(date, prefs.earliestBlock, tz).getTime(),
  );
  const end = Math.min(
    zonedToUtc(date, prefs.latestBlockEnd, tz).getTime(),
    sleepStartUtc(date, prefs, tz).getTime(),
  );
  return { start: new Date(start), end: new Date(end) };
}

export function eveningWindowUtc(date: string, prefs: DayPrefs, tz: string): { start: Date; end: Date } {
  return { start: zonedToUtc(date, prefs.eveningStart, tz), end: sleepStartUtc(date, prefs, tz) };
}

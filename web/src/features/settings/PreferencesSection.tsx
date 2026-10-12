import { useState, type FormEvent, type ReactElement } from 'react';
import type { Preferences } from '@life-tracker/shared';

type Weekday = number;
type TimeWindow = Preferences['preferredStartupWindows'][number];
import { ApiError } from '../../api/client';
import { usePreferences, useSavePreferences } from '../../api/hooks/preferences';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { WEEKDAYS } from './FixedScheduleSection';

function DayChips({ label, days, onChange }: { label: string; days: Weekday[]; onChange: (d: Weekday[]) => void }) {
  return (
    <div className="day-chips" role="group" aria-label={label}>
      {WEEKDAYS.map((name, i) => {
        const d = (i + 1) as Weekday;
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            className={on ? 'chip chip-on' : 'chip'}
            aria-pressed={on}
            aria-label={`${label}: ${name}`}
            onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))}
          >
            {name.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

/** Weekday chips plus start/end times, with add/remove rows. */
export function TimeWindowEditor({ label, windows, onChange, errors }: { label: string; windows: TimeWindow[]; onChange: (w: TimeWindow[]) => void; errors: Record<string, string> }) {
  const update = (i: number, patch: Partial<TimeWindow>) => onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="window-editor">
      <h4>{label}s</h4>
      {windows.map((w, i) => (
        <div key={i} className="window-row">
          <DayChips label={`${label} ${i + 1} days`} days={w.days} onChange={(days) => update(i, { days })} />
          <Field label={`${label} ${i + 1} start`} error={errors[`${i}.start`]}>
            <input type="time" value={w.start} onChange={(e) => update(i, { start: e.target.value })} />
          </Field>
          <Field label={`${label} ${i + 1} end`} error={errors[`${i}.end`]}>
            <input type="time" value={w.end} onChange={(e) => update(i, { end: e.target.value })} />
          </Field>
          <button type="button" onClick={() => onChange(windows.filter((_, j) => j !== i))} aria-label={`Remove ${label} ${i + 1}`}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...windows, { days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' }])}>
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

export function PreferencesSection() {
  const { data } = usePreferences();
  if (!data) return <p className="muted">Loading preferences…</p>;
  return <PreferencesForm key={JSON.stringify(data)} initial={data} />;
}

/** Picks the server field errors under `prefix.` and strips the prefix. */
function sub(errors: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
  return out;
}

function PreferencesForm({ initial }: { initial: Preferences }) {
  const [p, setP] = useState<Preferences>(() => structuredClone(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSavePreferences();
  const toast = useToast();
  const patch = (x: Partial<Preferences>) => setP((cur) => ({ ...cur, ...x }));

  const time = (label: string, key: string, value: string, set: (v: string) => void) => (
    <Field label={label} error={errors[key]}>
      <input type="time" value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );
  const num = (label: string, key: string, value: number, set: (v: number) => void, step = '1'): ReactElement => (
    <Field label={label} error={errors[key]}>
      <input type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </Field>
  );

  async function submit(body: Partial<Preferences>, ok: string) {
    setErrors({});
    try {
      await save.mutateAsync(body);
      toast.show(ok);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.show(err instanceof ApiError ? err.message : 'Could not save preferences', 'error');
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(p, 'Preferences saved');
  }

  function reset() {
    if (!window.confirm('Reset all planner preferences to defaults?')) return;
    void submit({}, 'Preferences reset');
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend>Day</legend>
        {time('Sleep start', 'sleep.start', p.sleep.start, (v) => patch({ sleep: { ...p.sleep, start: v } }))}
        {time('Sleep end', 'sleep.end', p.sleep.end, (v) => patch({ sleep: { ...p.sleep, end: v } }))}
        {time('Earliest block', 'earliestBlock', p.earliestBlock, (v) => patch({ earliestBlock: v }))}
        {time('Latest block end', 'latestBlockEnd', p.latestBlockEnd, (v) => patch({ latestBlockEnd: v }))}
        {num('Buffer between blocks (min)', 'bufferMinutes', p.bufferMinutes, (v) => patch({ bufferMinutes: v }))}
      </fieldset>
      <fieldset>
        <legend>Limits</legend>
        {num('Max planned per day (min)', 'maxPlannedMinutesPerDay', p.maxPlannedMinutesPerDay, (v) => patch({ maxPlannedMinutesPerDay: v }))}
        {num('Max study per day (min)', 'maxStudyMinutesPerDay', p.maxStudyMinutesPerDay, (v) => patch({ maxStudyMinutesPerDay: v }))}
        {num('Max per course per day (min)', 'maxMinutesPerCoursePerDay', p.maxMinutesPerCoursePerDay, (v) => patch({ maxMinutesPerCoursePerDay: v }))}
      </fieldset>
      <fieldset>
        <legend>Block lengths</legend>
        {num('Study block min (min)', 'studyBlock.min', p.studyBlock.min, (v) => patch({ studyBlock: { ...p.studyBlock, min: v } }), '15')}
        {num('Study block max (min)', 'studyBlock.max', p.studyBlock.max, (v) => patch({ studyBlock: { ...p.studyBlock, max: v } }), '15')}
        {num('Startup block min (min)', 'startupBlock.min', p.startupBlock.min, (v) => patch({ startupBlock: { ...p.startupBlock, min: v } }), '15')}
        {num('Startup block max (min)', 'startupBlock.max', p.startupBlock.max, (v) => patch({ startupBlock: { ...p.startupBlock, max: v } }), '15')}
        <TimeWindowEditor label="Startup window" windows={p.preferredStartupWindows} onChange={(w) => patch({ preferredStartupWindows: w })} errors={sub(errors, 'preferredStartupWindows')} />
      </fieldset>
      <fieldset>
        <legend>Workouts</legend>
        {num('Gym duration (min)', 'workoutDurations.gym', p.workoutDurations.gym, (v) => patch({ workoutDurations: { ...p.workoutDurations, gym: v } }))}
        {num('Cardio duration (min)', 'workoutDurations.cardio', p.workoutDurations.cardio, (v) => patch({ workoutDurations: { ...p.workoutDurations, cardio: v } }))}
        {num('Sport duration (min)', 'workoutDurations.sport', p.workoutDurations.sport, (v) => patch({ workoutDurations: { ...p.workoutDurations, sport: v } }))}
        <TimeWindowEditor label="Workout window" windows={p.preferredWorkoutWindows} onChange={(w) => patch({ preferredWorkoutWindows: w })} errors={sub(errors, 'preferredWorkoutWindows')} />
        <h4>Allowed workout days</h4>
        <DayChips label="Allowed workout days" days={p.allowedWorkoutDays} onChange={(d) => patch({ allowedWorkoutDays: d })} />
        {num('Hours between gym sessions', 'minHoursBetweenGym', p.minHoursBetweenGym, (v) => patch({ minHoursBetweenGym: v }))}
      </fieldset>
      <fieldset>
        <legend>Meals</legend>
        {(['breakfast', 'lunch', 'dinner'] as const).map((m) => {
          const name = m[0]!.toUpperCase() + m.slice(1);
          return (
            <div key={m}>
              {time(`${name} time`, `meals.${m}.time`, p.meals[m].time, (v) => patch({ meals: { ...p.meals, [m]: { ...p.meals[m], time: v } } }))}
              {num(`${name} duration (min)`, `meals.${m}.minutes`, p.meals[m].minutes, (v) => patch({ meals: { ...p.meals, [m]: { ...p.meals[m], minutes: v } } }))}
            </div>
          );
        })}
        {num('Meal flex (min)', 'mealFlexMinutes', p.mealFlexMinutes, (v) => patch({ mealFlexMinutes: v }))}
        <Field label="Meal prep day" error={errors['mealPrep.day']}>
          <select value={p.mealPrep.day} onChange={(e) => patch({ mealPrep: { ...p.mealPrep, day: Number(e.target.value) as Weekday } })}>
            {WEEKDAYS.map((n, i) => (
              <option key={n} value={i + 1}>{n}</option>
            ))}
          </select>
        </Field>
        {time('Meal prep start', 'mealPrep.preferredStart', p.mealPrep.preferredStart, (v) => patch({ mealPrep: { ...p.mealPrep, preferredStart: v } }))}
        {num('Meal prep duration (min)', 'mealPrep.minutes', p.mealPrep.minutes, (v) => patch({ mealPrep: { ...p.mealPrep, minutes: v } }))}
      </fieldset>
      <fieldset>
        <legend>Evenings</legend>
        {time('Evening start', 'eveningStart', p.eveningStart, (v) => patch({ eveningStart: v }))}
        <h4>Protected evenings</h4>
        <DayChips label="Protected evenings" days={p.protectedEvenings} onChange={(d) => patch({ protectedEvenings: d })} />
      </fieldset>
      <fieldset>
        <legend>Review</legend>
        {time('Review prompt time', 'reviewPromptTime', p.reviewPromptTime, (v) => patch({ reviewPromptTime: v }))}
        <label className="goal-off">
          <input type="checkbox" checked={p.classesCountTowardStudy} onChange={(e) => patch({ classesCountTowardStudy: e.target.checked })} />
          Classes count toward study
        </label>
      </fieldset>
      <button className="primary" type="submit" disabled={save.isPending}>
        Save preferences
      </button>
      <button type="button" onClick={reset} disabled={save.isPending}>
        Reset to defaults
      </button>
    </form>
  );
}

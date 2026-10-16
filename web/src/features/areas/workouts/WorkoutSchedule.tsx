import { useState, type FormEvent } from 'react';
import { WORKOUT_TYPES, type Preferences, type WorkoutType } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useGoals, useSaveGoals, type GoalSet } from '../../../api/hooks/goals';
import { usePatchPreferences, usePreferences } from '../../../api/hooks/preferences';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { BufferFields, DayChips, TimeWindowEditor, WEEKDAYS, subErrors, type TimeWindow } from '../../../components/planning';
import { TYPE_LABEL } from './SessionForm';

/** The preference keys this page owns; only these are sent with PATCH. */
const KEYS = ['workoutDurations', 'workoutAvailability', 'preferredWorkoutWindows', 'allowedWorkoutDays', 'minHoursBetweenGym', 'workoutBuffer'] as const;
type WorkoutPrefs = Pick<Preferences, (typeof KEYS)[number]>;

const pick = (p: Preferences): WorkoutPrefs => structuredClone(Object.fromEntries(KEYS.map((k) => [k, p[k]])) as WorkoutPrefs);

interface Entry {
  off: boolean;
  value: string;
}
const entry = (n: number | null): Entry => ({ off: n === null, value: n === null ? '' : String(n) });
const num = (e: Entry): number | null => (e.off || e.value.trim() === '' ? null : Number(e.value));

interface GoalState {
  total: Entry;
  byType: Record<WorkoutType, Entry>;
}
const toGoalState = (g: GoalSet): GoalState => ({
  total: entry(g.workoutsTotal),
  byType: { gym: entry(g.workoutsByType.gym), cardio: entry(g.workoutsByType.cardio), sport: entry(g.workoutsByType.sport) },
});

const RENDERED = /^(workoutsTotal|workoutsByType\.\w+|workoutDurations\.\w+|allowedWorkoutDays|minHoursBetweenGym|workoutBuffer\.(before|after)|(workoutAvailability|preferredWorkoutWindows)\.\d+\.(start|end|days))$/;

function GoalField({ label, entry: e, onChange, error }: { label: string; entry: Entry; onChange: (e: Entry) => void; error?: string }) {
  return (
    <div className="wk-goal">
      <Field label={label} error={error}>
        <input type="number" inputMode="numeric" min={0} step="1" value={e.value} onChange={(ev) => onChange({ off: ev.target.value.trim() === '', value: ev.target.value })} />
      </Field>
      <label className="wk-goal-off">
        <input type="checkbox" checked={e.off} onChange={(ev) => onChange(ev.target.checked ? { off: true, value: '' } : { ...e, off: false })} aria-label={`No goal for ${label}`} />
        No goal
      </label>
    </div>
  );
}

const overlap = (a: TimeWindow, b: TimeWindow) => a.start < b.end && b.start < a.end;

/** Per weekday: where a workout could go (availability on allowed days), and which of those times are preferred. */
function WeekPreview({ p, day }: { p: WorkoutPrefs; day: { start: string; end: string } }) {
  return (
    <ul className="wk-preview" aria-label="Workout possibilities per day">
      {WEEKDAYS.map((name, i) => {
        const d = i + 1;
        const allowed = p.allowedWorkoutDays.includes(d);
        const open = p.workoutAvailability.length === 0 ? [{ days: [d], ...day }] : p.workoutAvailability.filter((w) => w.days.includes(d));
        const preferred = p.preferredWorkoutWindows.filter((w) => w.days.includes(d) && open.some((o) => overlap(o, w)));
        const slots = [...open].sort((a, b) => a.start.localeCompare(b.start));
        return (
          <li key={d} className="wk-row">
            <strong>{name.slice(0, 3)}</strong>
            <span className={allowed && slots.length > 0 ? undefined : 'muted'}>
              {!allowed ? 'No workouts' : slots.length === 0 ? 'Not available' : slots.map((w) => `${w.start}–${w.end}`).join(', ')}
              {allowed && preferred.length > 0 && <span className="muted"> · prefers {preferred.map((w) => `${w.start}–${w.end}`).join(', ')}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function WorkoutSchedule() {
  const prefs = usePreferences();
  const goals = useGoals();
  if (!prefs.data || !goals.data) return <p className="muted">Loading schedule…</p>;
  return <ScheduleForm initial={prefs.data} goals={goals.data} />;
}

function ScheduleForm({ initial, goals }: { initial: Preferences; goals: GoalSet }) {
  const [p, setP] = useState<WorkoutPrefs>(() => pick(initial));
  const [g, setG] = useState<GoalState>(() => toGoalState(goals));
  const [goalsDirty, setGoalsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Raw text of numeric inputs, so a cleared input stays empty instead of becoming 0.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const savePrefs = usePatchPreferences();
  const saveGoals = useSaveGoals();
  const toast = useToast();
  const patch = (x: Partial<WorkoutPrefs>) => setP((cur) => ({ ...cur, ...x }));
  const setGoal = (x: Partial<GoalState>) => {
    setG((cur) => ({ ...cur, ...x }));
    setGoalsDirty(true);
  };
  const pending = savePrefs.isPending || saveGoals.isPending;
  const unmatched = Object.entries(errors).filter(([k]) => !RENDERED.test(k));

  const numField = (label: string, key: string, value: number, set: (v: number) => void) => (
    <Field label={label} error={errors[key]}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step="1"
        value={raw[key] ?? String(value)}
        onChange={(e) => {
          const text = e.target.value;
          setRaw((r) => ({ ...r, [key]: text }));
          // NaN serialises to null, which the server rejects with a field error rather than saving 0.
          set(text.trim() === '' ? Number.NaN : Number(text));
        }}
      />
    </Field>
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const merged: GoalSet = {
      ...goals,
      workoutsTotal: num(g.total),
      workoutsByType: { gym: num(g.byType.gym), cardio: num(g.byType.cardio), sport: num(g.byType.sport) },
    };
    const [prefsResult, goalsResult] = await Promise.allSettled([
      savePrefs.mutateAsync(p),
      goalsDirty ? saveGoals.mutateAsync(merged) : Promise.resolve(goals),
    ]);
    const failed = [prefsResult, goalsResult].flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
    if (goalsResult.status === 'fulfilled') setGoalsDirty(false);
    if (failed.length === 0) {
      toast.show('Workout schedule saved');
      return;
    }
    const fields = Object.assign({}, ...failed.map((err) => (err instanceof ApiError && err.fields ? err.fields : {})));
    setErrors(fields);
    toast.showError(failed[0], 'Could not save workout schedule');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="wk-schedule">
      <fieldset>
        <legend>How often</legend>
        <GoalField label="Workouts per week" entry={g.total} onChange={(v) => setGoal({ total: v })} error={errors.workoutsTotal} />
        {WORKOUT_TYPES.map((t) => (
          <GoalField
            key={t}
            label={`${TYPE_LABEL[t]} workouts per week`}
            entry={g.byType[t]}
            onChange={(v) => setGoal({ byType: { ...g.byType, [t]: v } })}
            error={errors[`workoutsByType.${t}`]}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>How long</legend>
        {WORKOUT_TYPES.map((t) => (
          <div key={t}>
            {numField(`${TYPE_LABEL[t]} duration (min)`, `workoutDurations.${t}`, p.workoutDurations[t], (v) => patch({ workoutDurations: { ...p.workoutDurations, [t]: v } }))}
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>When can you work out?</legend>
        <p className="muted">Workouts are only planned inside these windows.</p>
        <TimeWindowEditor
          label="Available window"
          windows={p.workoutAvailability}
          onChange={(w) => patch({ workoutAvailability: w })}
          errors={subErrors(errors, 'workoutAvailability')}
          emptyText="Any time of the day"
          newWindow={{ days: [1, 2, 3, 4, 5], start: '07:00', end: '21:00' }}
        />
        <h4>Workout days</h4>
        <DayChips label="Allowed workout days" days={p.allowedWorkoutDays} error={errors.allowedWorkoutDays} onChange={(d) => patch({ allowedWorkoutDays: d })} />
        {numField('Hours between gym sessions', 'minHoursBetweenGym', p.minHoursBetweenGym, (v) => patch({ minHoursBetweenGym: v }))}
      </fieldset>
      <fieldset>
        <legend>When do you prefer?</legend>
        <TimeWindowEditor
          label="Preferred window"
          windows={p.preferredWorkoutWindows}
          onChange={(w) => patch({ preferredWorkoutWindows: w })}
          errors={subErrors(errors, 'preferredWorkoutWindows')}
          emptyText="No preference"
        />
      </fieldset>
      <fieldset>
        <legend>Buffers</legend>
        <p className="muted">Time kept free before and after every workout for travel, changing and showering.</p>
        <BufferFields label="Workout buffer" value={p.workoutBuffer} onChange={(v) => patch({ workoutBuffer: v })} errors={subErrors(errors, 'workoutBuffer')} />
      </fieldset>
      <section className="card wk-week">
        <strong>Your gym week</strong>
        <WeekPreview p={p} day={{ start: initial.earliestBlock, end: initial.latestBlockEnd }} />
      </section>
      {unmatched.length > 0 && (
        <ul className="error" role="alert" aria-label="Other problems">
          {unmatched.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
      <button className="primary" type="submit" disabled={pending}>
        Save schedule
      </button>
    </form>
  );
}

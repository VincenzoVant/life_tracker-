import { useState, type FormEvent } from 'react';
import { WORKOUT_TYPES } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { useGoals, useSaveGoals, type GoalSet } from '../../api/hooks/goals';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';

interface Entry {
  off: boolean;
  value: string;
}
const entry = (n: number | null, scale = 1): Entry => ({ off: n === null, value: n === null ? '' : String(n / scale) });
const num = (e: Entry, scale = 1): number | null => (e.off || e.value.trim() === '' ? null : scale === 1 ? Number(e.value) : Math.round(Number(e.value) * scale));

interface State {
  startupHours: Entry;
  workoutsTotal: Entry;
  byType: Record<(typeof WORKOUT_TYPES)[number], Entry>;
  freeEvenings: Entry;
  kcal: Entry;
  tolerance: string;
  protein: Entry;
}

function toState(g: GoalSet): State {
  return {
    startupHours: entry(g.startupMinutes, 60),
    workoutsTotal: entry(g.workoutsTotal),
    byType: { gym: entry(g.workoutsByType.gym), cardio: entry(g.workoutsByType.cardio), sport: entry(g.workoutsByType.sport) },
    freeEvenings: entry(g.freeEvenings),
    kcal: entry(g.dailyKcal?.target ?? null),
    tolerance: String(g.dailyKcal?.tolerancePct ?? 10),
    protein: entry(g.dailyProteinG),
  };
}

function toGoals(s: State): GoalSet {
  const kcal = num(s.kcal);
  return {
    startupMinutes: num(s.startupHours, 60),
    workoutsTotal: num(s.workoutsTotal),
    workoutsByType: { gym: num(s.byType.gym), cardio: num(s.byType.cardio), sport: num(s.byType.sport) },
    freeEvenings: num(s.freeEvenings),
    dailyKcal: kcal === null ? null : { target: kcal, tolerancePct: s.tolerance.trim() === '' ? 10 : Number(s.tolerance) },
    dailyProteinG: num(s.protein),
  };
}

function GoalField({ label, entry: e, onChange, error, step }: { label: string; entry: Entry; onChange: (e: Entry) => void; error?: string; step?: string }) {
  return (
    <div className="goal-row">
      <Field label={label} error={error}>
        <input type="number" inputMode="decimal" min={0} step={step ?? '1'} disabled={e.off} value={e.value} onChange={(ev) => onChange({ ...e, value: ev.target.value })} />
      </Field>
      <label className="goal-off">
        <input type="checkbox" checked={e.off} onChange={(ev) => onChange({ ...e, off: ev.target.checked })} aria-label={`No goal for ${label}`} />
        No goal
      </label>
    </div>
  );
}

export function GoalsForm() {
  const { data } = useGoals();
  if (!data) return <p className="muted">Loading goals…</p>;
  return <GoalsFields initial={data} />;
}

function GoalsFields({ initial }: { initial: GoalSet }) {
  const [s, setS] = useState<State>(() => toState(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveGoals();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync(toGoals(s));
      toast.show('Goals saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save goals');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <GoalField label="Startup (hours per week)" step="0.25" entry={s.startupHours} onChange={(v) => setS({ ...s, startupHours: v })} error={errors.startupMinutes} />
      <GoalField label="Workouts per week" entry={s.workoutsTotal} onChange={(v) => setS({ ...s, workoutsTotal: v })} error={errors.workoutsTotal} />
      {WORKOUT_TYPES.map((t) => (
        <GoalField
          key={t}
          label={`${t[0]!.toUpperCase()}${t.slice(1)} workouts per week`}
          entry={s.byType[t]}
          onChange={(v) => setS({ ...s, byType: { ...s.byType, [t]: v } })}
          error={errors[`workoutsByType.${t}`]}
        />
      ))}
      <GoalField label="Free evenings per week" entry={s.freeEvenings} onChange={(v) => setS({ ...s, freeEvenings: v })} error={errors.freeEvenings} />
      <GoalField label="Daily calories" entry={s.kcal} onChange={(v) => setS({ ...s, kcal: v })} error={errors['dailyKcal.target']} />
      {!s.kcal.off && (
        <Field label="Calorie tolerance (%)" error={errors['dailyKcal.tolerancePct']}>
          <input type="number" inputMode="decimal" min={0} max={100} value={s.tolerance} onChange={(ev) => setS({ ...s, tolerance: ev.target.value })} />
        </Field>
      )}
      <GoalField label="Daily protein (g)" entry={s.protein} onChange={(v) => setS({ ...s, protein: v })} error={errors.dailyProteinG} />
      <button className="primary" type="submit" disabled={save.isPending}>
        Save goals
      </button>
    </form>
  );
}

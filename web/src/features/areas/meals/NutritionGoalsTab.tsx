import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../api/client';
import { useGoals, useSaveGoals, type GoalSet } from '../../../api/hooks/goals';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';

interface Entry {
  off: boolean;
  value: string;
}
const entry = (n: number | null | undefined): Entry => (n == null ? { off: true, value: '' } : { off: false, value: String(n) });
const num = (e: Entry): number | null => (e.off || e.value.trim() === '' ? null : Number(e.value));

function GoalField({ label, entry: e, onChange, error }: { label: string; entry: Entry; onChange: (e: Entry) => void; error?: string }) {
  return (
    <div className="meal-slot-row">
      <Field label={label} error={error}>
        <input type="number" inputMode="decimal" min={0} value={e.value} onChange={(ev) => onChange({ off: ev.target.value.trim() === '', value: ev.target.value })} />
      </Field>
      <label className="meal-check">
        <input type="checkbox" checked={e.off} onChange={(ev) => onChange(ev.target.checked ? { off: true, value: '' } : { ...e, off: false })} aria-label={`No goal for ${label}`} />
        No goal
      </label>
    </div>
  );
}

export function NutritionGoalsTab() {
  const { data } = useGoals();
  if (!data) return <p className="muted">Loading…</p>;
  return <NutritionGoalsForm goals={data} />;
}

function NutritionGoalsForm({ goals }: { goals: GoalSet }) {
  const [kcal, setKcal] = useState(() => entry(goals.dailyKcal?.target));
  const [tolerance, setTolerance] = useState(() => String(goals.dailyKcal?.tolerancePct ?? 10));
  const [protein, setProtein] = useState(() => entry(goals.dailyProteinG));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveGoals();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const target = num(kcal);
    // PUT replaces the whole goal set, so keep every other goal as it is.
    const body: GoalSet = {
      ...goals,
      dailyKcal: target === null ? null : { target, tolerancePct: tolerance.trim() === '' ? 10 : Number(tolerance) },
      dailyProteinG: num(protein),
    };
    try {
      await save.mutateAsync(body);
      toast.show('Nutrition goals saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save nutrition goals');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card">
      <h2>Daily nutrition goals</h2>
      <GoalField label="Daily calories" entry={kcal} onChange={setKcal} error={errors['dailyKcal.target']} />
      {!kcal.off && (
        <Field label="Calorie tolerance (%)" error={errors['dailyKcal.tolerancePct']}>
          <input type="number" inputMode="decimal" min={0} max={100} value={tolerance} onChange={(ev) => setTolerance(ev.target.value)} />
        </Field>
      )}
      <GoalField label="Daily protein (g)" entry={protein} onChange={setProtein} error={errors.dailyProteinG} />
      <button className="primary" type="submit" disabled={save.isPending}>
        Save nutrition goals
      </button>
    </form>
  );
}

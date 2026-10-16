import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../api/client';
import { useGoals, useSaveGoals, type GoalSet } from '../../../api/hooks/goals';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';

const text = (n: number | null, scale = 1): string => (n === null ? '' : String(n / scale));
const value = (s: string, scale = 1): number | null => (s.trim() === '' ? null : Math.round(Number(s) * scale));

/** Startup hours and free evenings. Goals are saved as a whole set, so the other goals are sent back unchanged. */
export function WeeklyGoals() {
  const { data } = useGoals();
  if (!data) return <p className="muted">Loading goals…</p>;
  return <GoalFields initial={data} />;
}

function GoalFields({ initial }: { initial: GoalSet }) {
  const [startup, setStartup] = useState(text(initial.startupMinutes, 60));
  const [evenings, setEvenings] = useState(text(initial.freeEvenings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveGoals();
  const { data: current } = useGoals();
  const toast = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync({ ...(current ?? initial), startupMinutes: value(startup, 60), freeEvenings: value(evenings) });
      toast.show('Goals saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save goals');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card tw-goals" aria-label="Weekly goals">
      <p className="muted">Leave a field empty for no goal. Startup projects above come on top of these hours.</p>
      <div className="buffer-fields">
        <Field label="Startup hours per week" error={errors.startupMinutes}>
          <input type="number" inputMode="decimal" min={0} step="0.25" value={startup} onChange={(e) => setStartup(e.target.value)} />
        </Field>
        <Field label="Free evenings per week" error={errors.freeEvenings}>
          <input type="number" inputMode="numeric" min={0} max={7} value={evenings} onChange={(e) => setEvenings(e.target.value)} />
        </Field>
      </div>
      <button className="primary" type="submit" disabled={save.isPending}>
        Save goals
      </button>
    </form>
  );
}

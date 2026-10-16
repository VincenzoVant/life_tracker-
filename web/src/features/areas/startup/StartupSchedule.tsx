import { useState, type FormEvent } from 'react';
import type { Preferences } from '@life-tracker/shared';
import { Link } from 'react-router';
import { ApiError } from '../../../api/client';
import { usePatchPreferences, usePreferences } from '../../../api/hooks/preferences';
import { Field } from '../../../components/Field';
import { subErrors, TimeWindowEditor } from '../../../components/planning';
import { useToast } from '../../../components/Toast';

type Prefs = Pick<Preferences, 'startupBlock' | 'preferredStartupWindows'>;

/** When the planner should put startup work: block lengths and preferred windows. */
export function StartupSchedule() {
  const { data } = usePreferences();
  if (!data) return <p className="muted">Loading…</p>;
  const initial: Prefs = { startupBlock: data.startupBlock, preferredStartupWindows: data.preferredStartupWindows };
  return <StartupScheduleForm key={JSON.stringify(initial)} initial={initial} />;
}

function StartupScheduleForm({ initial }: { initial: Prefs }) {
  const [p, setP] = useState<Prefs>(() => structuredClone(initial));
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = usePatchPreferences();
  const toast = useToast();

  const length = (side: 'min' | 'max', label: string) => (
    <Field label={label} error={errors[`startupBlock.${side}`]}>
      <input
        type="number"
        inputMode="numeric"
        min={15}
        step={15}
        value={raw[side] ?? String(p.startupBlock[side])}
        onChange={(e) => {
          const text = e.target.value;
          setRaw((r) => ({ ...r, [side]: text }));
          setP({ ...p, startupBlock: { ...p.startupBlock, [side]: text.trim() === '' ? Number.NaN : Number(text) } });
        }}
      />
    </Field>
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync(p);
      toast.show('Startup schedule saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save startup schedule');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="muted">
        Hours per week are set in <Link to="/areas/this-week">This week</Link>. Here you choose when and in what chunks.
      </p>
      <div className="buffer-fields">
        {length('min', 'Shortest startup block (min)')}
        {length('max', 'Longest startup block (min)')}
      </div>
      <TimeWindowEditor
        label="Startup window"
        windows={p.preferredStartupWindows}
        onChange={(w) => setP({ ...p, preferredStartupWindows: w })}
        errors={subErrors(errors, 'preferredStartupWindows')}
        emptyText="No preference: the planner uses any free time."
        newWindow={{ days: [1, 2, 3, 4, 5], start: '19:00', end: '22:00' }}
      />
      <button className="primary" type="submit" disabled={save.isPending}>
        Save startup schedule
      </button>
    </form>
  );
}

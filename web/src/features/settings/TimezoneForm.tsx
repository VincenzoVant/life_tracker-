import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useSaveSettings, useTimezone } from '../../api/hooks/settings';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';

const ZONES = Intl.supportedValuesOf('timeZone');

export function TimezoneForm() {
  const current = useTimezone();
  const [choice, setChoice] = useState<string | null>(null);
  const save = useSaveSettings();
  const toast = useToast();
  const value = choice ?? current;
  const options = ZONES.includes(value) ? ZONES : [value, ...ZONES];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ timezone: value });
      toast.show('Timezone saved');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not save timezone', 'error');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Timezone">
        <select value={value} onChange={(e) => setChoice(e.target.value)}>
          {options.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>
      <button className="primary" type="submit" disabled={save.isPending}>
        Save timezone
      </button>
    </form>
  );
}

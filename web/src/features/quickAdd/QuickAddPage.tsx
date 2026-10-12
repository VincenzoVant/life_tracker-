import { CATEGORY_META, QUICK_ADD_CATEGORIES, localDateOf, localTimeOf, zonedToUtc, type QuickAddInput } from '@life-tracker/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { useQuickAdd } from '../../api/hooks/replan';
import { useSettings, useTimezone } from '../../api/hooks/settings';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import './quickAdd.css';

type WhenChoice = 'rest_of_tonight' | 'this_afternoon' | 'all_day' | 'custom';
type Category = (typeof QUICK_ADD_CATEGORIES)[number];

const WHEN_CHIPS: Array<{ value: WhenChoice; label: string }> = [
  { value: 'rest_of_tonight', label: 'Rest of tonight' },
  { value: 'this_afternoon', label: 'This afternoon' },
  { value: 'all_day', label: 'All day' },
  { value: 'custom', label: 'Pick a time' },
];
const DURATIONS = [60, 120, 180] as const;

function Chips<T extends string | number>({
  label, options, value, onChange,
}: { label: string; options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'chip selected' : 'chip'} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Waits for settings so defaults use the configured timezone. */
export function QuickAddPage() {
  const settings = useSettings();
  if (settings.isPending) return <p className="muted">Loading…</p>;
  return <QuickAddForm />;
}

function QuickAddForm() {
  const tz = useTimezone();
  const navigate = useNavigate();
  const toast = useToast();
  const quickAdd = useQuickAdd();
  const now = new Date();

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<WhenChoice>(localTimeOf(now, tz) >= '15:00' ? 'rest_of_tonight' : 'this_afternoon');
  const [date, setDate] = useState(localDateOf(now, tz));
  const [time, setTime] = useState(localTimeOf(now, tz));
  const [duration, setDuration] = useState<number | 'custom'>(60);
  const [customMinutes, setCustomMinutes] = useState('90');
  const [category, setCategory] = useState<Category>('social');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    let whenInput: QuickAddInput['when'];
    if (when === 'custom') {
      const minutes = duration === 'custom' ? Number(customMinutes) : duration;
      if (!date || !time) {
        setErrors({ when: 'Pick a date and start time' });
        return;
      }
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
        setErrors({ when: 'Duration must be between 15 minutes and 24 hours' });
        return;
      }
      whenInput = { start: zonedToUtc(date, time, tz).toISOString(), durationMinutes: minutes };
    } else {
      whenInput = { preset: when };
    }
    try {
      const result = await quickAdd.mutateAsync({ title, category, when: whenInput });
      if (result.draft) {
        navigate(`/replan/${result.draft.plan.id}`);
      } else {
        toast.show('Added — nothing else needed to move');
        navigate('/');
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        const extra = Object.entries(err.fields).filter(([k]) => k !== 'when' && k !== 'title');
        if (extra.length) setFormError(extra.map(([k, m]) => `${k}: ${m}`).join('; '));
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong');
      }
    }
  }

  return (
    <form className="quick-add" onSubmit={submit} noValidate>
      <h1>Something came up</h1>
      <Field label="What" error={errors.title}>
        <input type="text" autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="field">
        <span className="field-label">When</span>
        <Chips label="When" options={WHEN_CHIPS} value={when} onChange={setWhen} />
        {when === 'custom' && (
          <div className="when-custom">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Start time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Chips
              label="Duration"
              options={[...DURATIONS.map((m) => ({ value: m as number | 'custom', label: `${m / 60} h` })), { value: 'custom', label: 'Custom' }]}
              value={duration}
              onChange={setDuration}
            />
            {duration === 'custom' && (
              <Field label="Minutes">
                <input type="number" min={15} max={1440} step={5} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} />
              </Field>
            )}
          </div>
        )}
        {errors.when && (
          <p className="error" role="alert">
            {errors.when}
          </p>
        )}
      </div>

      <div className="field">
        <span className="field-label">Category</span>
        <Chips
          label="Category"
          options={QUICK_ADD_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
          value={category}
          onChange={setCategory}
        />
      </div>

      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}
      <button type="submit" className="primary quick-add-save" disabled={quickAdd.isPending}>
        Save
      </button>
    </form>
  );
}

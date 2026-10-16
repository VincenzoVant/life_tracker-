import { useState, type FormEvent, type ReactElement } from 'react';
import type { Preferences } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { usePatchPreferences, usePreferences, useSavePreferences } from '../../api/hooks/preferences';
import { Field } from '../../components/Field';
import { DayChips } from '../../components/planning';
import { useToast } from '../../components/Toast';

/** The preference keys this section owns; area pages own the rest. */
const DAY_KEYS = [
  'sleep', 'earliestBlock', 'latestBlockEnd', 'bufferMinutes', 'maxPlannedMinutesPerDay',
  'eveningStart', 'protectedEvenings', 'reviewPromptTime',
] as const;
type DayPrefs = Pick<Preferences, (typeof DAY_KEYS)[number]>;

const pick = (p: Preferences): DayPrefs =>
  Object.fromEntries(DAY_KEYS.map((k) => [k, structuredClone(p[k])])) as DayPrefs;

const RENDERED_KEYS = new Set([
  'sleep.start', 'sleep.end', 'earliestBlock', 'latestBlockEnd', 'bufferMinutes', 'maxPlannedMinutesPerDay',
  'eveningStart', 'protectedEvenings', 'reviewPromptTime',
]);

export function DaySection() {
  const { data } = usePreferences();
  if (!data) return <p className="muted">Loading preferences…</p>;
  return <DayForm key={JSON.stringify(pick(data))} initial={pick(data)} />;
}

function DayForm({ initial }: { initial: DayPrefs }) {
  const [p, setP] = useState<DayPrefs>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Raw text of numeric inputs, so a cleared input stays empty instead of becoming 0.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const patchPrefs = usePatchPreferences();
  const savePrefs = useSavePreferences();
  const toast = useToast();
  const busy = patchPrefs.isPending || savePrefs.isPending;
  const unmatched = Object.entries(errors).filter(([k]) => !RENDERED_KEYS.has(k));
  const patch = (x: Partial<DayPrefs>) => setP((cur) => ({ ...cur, ...x }));

  const time = (label: string, key: string, value: string, set: (v: string) => void) => (
    <Field label={label} error={errors[key]}>
      <input type="time" value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );
  const num = (label: string, key: string, value: number, set: (v: number) => void): ReactElement => (
    <Field label={label} error={errors[key]}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
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

  async function run(save: () => Promise<unknown>, ok: string) {
    setErrors({});
    try {
      await save();
      toast.show(ok);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save preferences');
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() => patchPrefs.mutateAsync(p), 'Day settings saved');
  }

  function reset() {
    if (!window.confirm('Reset all planning preferences, in every area, to defaults?')) return;
    void run(() => savePrefs.mutateAsync({}), 'Preferences reset');
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend>Your day</legend>
        {time('Sleep start', 'sleep.start', p.sleep.start, (v) => patch({ sleep: { ...p.sleep, start: v } }))}
        {time('Sleep end', 'sleep.end', p.sleep.end, (v) => patch({ sleep: { ...p.sleep, end: v } }))}
        {time('Earliest block', 'earliestBlock', p.earliestBlock, (v) => patch({ earliestBlock: v }))}
        {time('Latest block end', 'latestBlockEnd', p.latestBlockEnd, (v) => patch({ latestBlockEnd: v }))}
        {num('Minimum gap between blocks (min)', 'bufferMinutes', p.bufferMinutes, (v) => patch({ bufferMinutes: v }))}
        {num('Max planned per day (min)', 'maxPlannedMinutesPerDay', p.maxPlannedMinutesPerDay, (v) => patch({ maxPlannedMinutesPerDay: v }))}
      </fieldset>
      <fieldset>
        <legend>Evenings</legend>
        {time('Evening start', 'eveningStart', p.eveningStart, (v) => patch({ eveningStart: v }))}
        <h4>Protected evenings</h4>
        <DayChips label="Protected evenings" days={p.protectedEvenings} error={errors.protectedEvenings} onChange={(d) => patch({ protectedEvenings: d as DayPrefs['protectedEvenings'] })} />
        {time('Review prompt time', 'reviewPromptTime', p.reviewPromptTime, (v) => patch({ reviewPromptTime: v }))}
      </fieldset>
      {unmatched.length > 0 && (
        <ul className="error" role="alert" aria-label="Other problems">
          {unmatched.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
      <button className="primary" type="submit" disabled={busy}>
        Save day settings
      </button>
      <button type="button" onClick={reset} disabled={busy}>
        Reset to defaults
      </button>
    </form>
  );
}

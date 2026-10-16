import { useState, type ReactNode } from 'react';
import type { Preferences } from '@life-tracker/shared';
import { Field } from './Field';
import './planning.css';

type Weekday = number;
/** The window shape as stored in preferences (days are plain numbers 1..7). */
export type TimeWindow = Preferences['preferredStartupWindows'][number];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Toggle buttons for the seven ISO weekdays (1 = Monday). */
export function DayChips({ label, days, onChange, error }: { label: string; days: Weekday[]; onChange: (d: Weekday[]) => void; error?: string }) {
  return (
    <div className="day-chips" role="group" aria-label={label} aria-invalid={error ? true : undefined}>
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Weekday chips plus start/end times, with add/remove rows. `errors` keys look like `0.start`. */
export function TimeWindowEditor({
  label,
  windows,
  onChange,
  errors,
  emptyText,
  newWindow = { days: [1, 2, 3, 4, 5], start: '17:00', end: '19:00' },
}: {
  label: string;
  windows: TimeWindow[];
  onChange: (w: TimeWindow[]) => void;
  errors: Record<string, string>;
  /** Shown when there are no windows, e.g. "Any time of the day". */
  emptyText?: string;
  newWindow?: TimeWindow;
}) {
  const update = (i: number, patch: Partial<TimeWindow>) => onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="window-editor">
      <h4>{label}s</h4>
      {windows.length === 0 && emptyText && <p className="muted">{emptyText}</p>}
      {windows.map((w, i) => (
        <div key={i} className="window-row">
          <DayChips label={`${label} ${i + 1} days`} days={w.days} onChange={(days) => update(i, { days })} error={errors[`${i}.days`]} />
          <div className="window-times">
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
        </div>
      ))}
      <button type="button" onClick={() => onChange([...windows, structuredClone(newWindow)])}>
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}

/** Before/after minute inputs for a buffer. Empty input is reported as NaN so the server returns a field error. */
export function BufferFields({
  label,
  value,
  onChange,
  errors = {},
}: {
  label: string;
  value: { before: number; after: number };
  onChange: (v: { before: number; after: number }) => void;
  errors?: Record<string, string>;
}) {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const input = (side: 'before' | 'after') => (
    <Field label={`${label} ${side} (min)`} error={errors[side]}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
        value={raw[side] ?? String(value[side])}
        onChange={(e) => {
          const text = e.target.value;
          setRaw((r) => ({ ...r, [side]: text }));
          onChange({ ...value, [side]: text.trim() === '' ? Number.NaN : Number(text) });
        }}
      />
    </Field>
  );
  return (
    <div className="buffer-fields">
      {input('before')}
      {input('after')}
    </div>
  );
}

export interface AreaTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

/** Simple tab strip for area pages. */
export function AreaTabs({ tabs, initial }: { tabs: AreaTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]!.key);
  const tab = tabs.find((t) => t.key === active) ?? tabs[0]!;
  return (
    <>
      <div className="area-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab.key} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab.label}>
        {tab.render()}
      </div>
    </>
  );
}

/** Picks the server field errors under `prefix.` and strips the prefix. */
export function subErrors(errors: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
  return out;
}

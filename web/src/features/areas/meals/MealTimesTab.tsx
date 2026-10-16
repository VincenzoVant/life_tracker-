import { useState, type FormEvent } from 'react';
import { PLANNED_MEALS, mealTimesFor, type MealCfg, type PlannedMeal, type Preferences } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { usePatchPreferences, usePreferences } from '../../../api/hooks/preferences';
import { Field } from '../../../components/Field';
import { DayChips, WEEKDAYS } from '../../../components/planning';
import { useToast } from '../../../components/Toast';

type MealPrefs = Pick<Preferences, 'meals' | 'mealsByDay' | 'mealFlexMinutes' | 'mealPrep'>;
type Override = Preferences['mealsByDay'][number];

const NAMES: Record<PlannedMeal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const pick = (p: Preferences): MealPrefs => ({ meals: p.meals, mealsByDay: p.mealsByDay ?? [], mealFlexMinutes: p.mealFlexMinutes, mealPrep: p.mealPrep });

export function MealTimesTab() {
  const { data } = usePreferences();
  if (!data) return <p className="muted">Loading…</p>;
  const initial = pick(data);
  return <MealTimesForm key={JSON.stringify(initial)} initial={initial} />;
}

/** True when the error key belongs to a control on this form. */
function isRendered(key: string): boolean {
  return /^(meals\.\w+\.(time|minutes)|mealFlexMinutes|mealPrep\.(day|preferredStart|minutes)|mealsByDay\.\d+\.(days|\w+\.(time|minutes)))$/.test(key);
}

function MealTimesForm({ initial }: { initial: MealPrefs }) {
  const [p, setP] = useState<MealPrefs>(() => structuredClone(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Raw text of numeric inputs, so a cleared input stays empty instead of becoming 0.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const save = usePatchPreferences();
  const toast = useToast();
  const unmatched = Object.entries(errors).filter(([k]) => !isRendered(k));
  const patch = (x: Partial<MealPrefs>) => setP((cur) => ({ ...cur, ...x }));
  const setOverride = (i: number, o: Override) => patch({ mealsByDay: p.mealsByDay.map((x, j) => (j === i ? o : x)) });

  const time = (label: string, key: string, value: string, set: (v: string) => void) => (
    <Field label={label} error={errors[key]}>
      <input type="time" value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );
  const num = (label: string, key: string, value: number, set: (v: number) => void) => (
    <Field label={label} error={errors[key]}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
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
  const slotFields = (label: string, key: string, cfg: MealCfg, set: (c: MealCfg) => void) => (
    <>
      {time(`${label} time`, `${key}.time`, cfg.time, (v) => set({ ...cfg, time: v }))}
      {num(`${label} duration (min)`, `${key}.minutes`, cfg.minutes, (v) => set({ ...cfg, minutes: v }))}
    </>
  );

  function addOverride() {
    const used = new Set(p.mealsByDay.flatMap((o) => o.days));
    const days = [6, 7].some((d) => used.has(d)) ? [] : [6, 7];
    patch({ mealsByDay: [...p.mealsByDay, { days, ...structuredClone(p.meals) }] });
  }

  function removeOverride(i: number) {
    setRaw((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('mealsByDay.'))));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('mealsByDay.'))));
    patch({ mealsByDay: p.mealsByDay.filter((_, j) => j !== i) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync({ meals: p.meals, mealsByDay: p.mealsByDay, mealFlexMinutes: p.mealFlexMinutes, mealPrep: p.mealPrep });
      toast.show('Meal times saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save meal times');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="meals-stack">
      <div className="card">
        <h2>Usual meal times</h2>
        {PLANNED_MEALS.map((m) => (
          <div key={m} className="meal-slot-row">
            {slotFields(NAMES[m], `meals.${m}`, p.meals[m], (c) => patch({ meals: { ...p.meals, [m]: c } }))}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Different on some days</h2>
        {p.mealsByDay.length === 0 && <p className="muted">Same meal times every day.</p>}
        {p.mealsByDay.map((o, i) => {
          const n = i + 1;
          return (
            <div key={i} className="meal-override">
              <div className="meal-override-head">
                <h3>Days {n}</h3>
                <button type="button" onClick={() => removeOverride(i)} aria-label={`Remove days ${n}`}>
                  Remove
                </button>
              </div>
              <DayChips label={`Days ${n}`} days={o.days} onChange={(days) => setOverride(i, { ...o, days })} error={errors[`mealsByDay.${i}.days`]} />
              {PLANNED_MEALS.map((m) => {
                const cfg = o[m];
                return (
                  <div key={m} className="meal-slot-row">
                    <h4>{NAMES[m]}</h4>
                    {cfg && slotFields(`Days ${n} ${m}`, `mealsByDay.${i}.${m}`, cfg, (c) => setOverride(i, { ...o, [m]: c }))}
                    <label className="meal-check">
                      <input
                        type="checkbox"
                        checked={cfg === null}
                        onChange={(e) => setOverride(i, { ...o, [m]: e.target.checked ? null : structuredClone(p.meals[m]) })}
                        aria-label={`Days ${n}: skip ${m}`}
                      />
                      Skip
                    </label>
                  </div>
                );
              })}
            </div>
          );
        })}
        <button type="button" onClick={addOverride}>
          Add different days
        </button>
      </div>

      <div className="card">
        <h2>Flexibility</h2>
        {num('Meal flex (min)', 'mealFlexMinutes', p.mealFlexMinutes, (v) => patch({ mealFlexMinutes: v }))}
        <p className="muted">How far the planner may move a meal from its time when something is in the way.</p>
      </div>

      <div className="card">
        <h2>Meal prep</h2>
        <Field label="Meal prep day" error={errors['mealPrep.day']}>
          <select value={p.mealPrep.day} onChange={(e) => patch({ mealPrep: { ...p.mealPrep, day: Number(e.target.value) } })}>
            {WEEKDAYS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        {time('Meal prep start', 'mealPrep.preferredStart', p.mealPrep.preferredStart, (v) => patch({ mealPrep: { ...p.mealPrep, preferredStart: v } }))}
        {num('Meal prep duration (min)', 'mealPrep.minutes', p.mealPrep.minutes, (v) => patch({ mealPrep: { ...p.mealPrep, minutes: v } }))}
      </div>

      <WeekPreview prefs={p} />

      {unmatched.length > 0 && (
        <ul className="error" role="alert" aria-label="Other problems">
          {unmatched.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
      <button className="primary" type="submit" disabled={save.isPending}>
        Save meal times
      </button>
    </form>
  );
}

const show = (c: MealCfg | null) => (c === null ? 'Skipped' : Number.isFinite(c.minutes) ? `${c.time} · ${c.minutes} min` : c.time);

/** The meal times the planner will use on each weekday, with the current (unsaved) edits. */
function WeekPreview({ prefs }: { prefs: MealPrefs }) {
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h2>Your week</h2>
      <table className="meal-week" aria-label="Meal times per day">
        <thead>
          <tr>
            <th scope="col">Day</th>
            {PLANNED_MEALS.map((m) => (
              <th key={m} scope="col">
                {NAMES[m]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((name, i) => {
            const day = mealTimesFor(prefs, i + 1);
            return (
              <tr key={name}>
                <th scope="row">{name.slice(0, 3)}</th>
                {PLANNED_MEALS.map((m) => {
                  const c = day[m];
                  const changed = c?.time !== prefs.meals[m].time || c?.minutes !== prefs.meals[m].minutes;
                  return (
                    <td key={m} aria-label={`${name} ${m}`} className={c === null ? 'muted' : changed ? 'changed' : undefined}>
                      {show(c)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

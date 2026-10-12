import { useState, type FormEvent } from 'react';
import { MEAL_SLOTS, addDays, localDateOf, type MealLogInput, type MealSlot } from '@life-tracker/shared';
import { useDeleteMealLog, useLogMeal, useMealLogs, useMeals } from '../../../api/hooks/food';
import { useGoals } from '../../../api/hooks/goals';
import { useTimezone } from '../../../api/hooks/settings';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { ProgressBar } from '../../../components/ProgressBar';
import { useToast } from '../../../components/Toast';

function AddLogModal({ date, slot, onClose }: { date: string; slot: MealSlot; onClose: () => void }) {
  const { data: meals = [] } = useMeals();
  const logMeal = useLogMeal();
  const toast = useToast();
  const [mode, setMode] = useState<'saved' | 'free'>('saved');
  const [mealId, setMealId] = useState('');
  const [servings, setServings] = useState('1');
  const [text, setText] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let input: MealLogInput;
    if (mode === 'saved') {
      const s = Number(servings);
      if (!mealId) return setError('Pick a meal');
      if (!(s > 0)) return setError('Servings must be above 0');
      input = { date, slot, mealId, servings: s };
    } else {
      if (!text.trim()) return setError('Describe what you ate');
      if (kcal.trim() === '' || protein.trim() === '') return setError('Calories and protein are required');
      input = { date, slot, freeText: text.trim(), kcal: Number(kcal), proteinG: Number(protein) };
    }
    try {
      await logMeal.mutateAsync(input);
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not log meal', 'error');
    }
  };

  return (
    <Modal title={`Add to ${slot}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="food-tabs">
          <button type="button" aria-pressed={mode === 'saved'} onClick={() => setMode('saved')}>Saved meal</button>
          <button type="button" aria-pressed={mode === 'free'} onClick={() => setMode('free')}>Free text</button>
        </div>
        {mode === 'saved' ? (
          <>
            <Field label="Meal" error={error}>
              <select value={mealId} onChange={(e) => setMealId(e.target.value)}>
                <option value="">Select…</option>
                {meals.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Servings">
              <input type="number" step="0.5" min="0" value={servings} onChange={(e) => setServings(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="What did you eat?" error={error}>
              <input value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Calories (kcal)">
              <input type="number" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)} />
            </Field>
            <Field label="Protein (g)">
              <input type="number" min="0" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </Field>
          </>
        )}
        <div className="food-actions">
          <button type="submit" className="primary">Log</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function MealLogDay() {
  const tz = useTimezone();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? localDateOf(new Date(), tz);
  const { data: logs = [], isPending } = useMealLogs(date);
  const { data: goals } = useGoals();
  const del = useDeleteMealLog();
  const [adding, setAdding] = useState<MealSlot | null>(null);

  const totals = logs.reduce((t, l) => ({ kcal: t.kcal + l.kcal, protein: t.protein + l.proteinG }), { kcal: 0, protein: 0 });
  const kcalTarget = goals?.dailyKcal?.target ?? null;
  const proteinTarget = goals?.dailyProteinG ?? null;

  return (
    <div className="food-stack">
      <div className="food-date">
        <button aria-label="Previous day" onClick={() => setPicked(addDays(date, -1))}>‹</button>
        <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setPicked(e.target.value)} />
        <button aria-label="Next day" onClick={() => setPicked(addDays(date, 1))}>›</button>
      </div>

      <div className="card food-totals" aria-label="Daily totals">
        <div>
          <div className="food-row">
            <span>Calories</span>
            <span>{totals.kcal}{kcalTarget != null ? ` / ${kcalTarget} kcal` : ' kcal'}</span>
          </div>
          {kcalTarget != null && <ProgressBar value={totals.kcal} max={kcalTarget} label="Calories" />}
        </div>
        <div>
          <div className="food-row">
            <span>Protein</span>
            <span>{totals.protein}{proteinTarget != null ? ` / ${proteinTarget} g` : ' g'}</span>
          </div>
          {proteinTarget != null && <ProgressBar value={totals.protein} max={proteinTarget} label="Protein" />}
        </div>
      </div>

      {isPending && <p className="muted">Loading…</p>}
      {MEAL_SLOTS.map((slot) => (
        <div key={slot} className="card food-slot">
          <h3>
            {slot}
            <button aria-label={`Add to ${slot}`} onClick={() => setAdding(slot)}>Add</button>
          </h3>
          {logs.filter((l) => l.slot === slot).map((l) => (
            <div key={l.id} className="food-row">
              <span>
                {l.freeText ?? 'Saved meal'}
                {l.mealId && l.servings !== 1 ? ` × ${l.servings}` : ''}
              </span>
              <span className="food-actions">
                <span className="muted">{l.kcal} kcal · {l.proteinG} g</span>
                <button aria-label={`Delete log ${l.id}`} onClick={() => del.mutate(l.id)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      ))}
      {adding && <AddLogModal date={date} slot={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

import { localDateOf, weekStartOf, type Block, type MealSlot } from '@life-tracker/shared';
import { useState } from 'react';
import { useClearMealPlanEntry, useMealPlan, useSetMealPlanEntry, type MealPlanEntry } from '../../api/hooks/mealPlan';
import { useMeals } from '../../api/hooks/food';
import { useTimezone } from '../../api/hooks/settings';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

/** Picks the meal and servings for one plan cell. */
export function MealAssignModal({ date, slot, current, onClose }: { date: string; slot: MealSlot; current?: MealPlanEntry; onClose: () => void }) {
  const meals = useMeals().data ?? [];
  const set = useSetMealPlanEntry();
  const clear = useClearMealPlanEntry();
  const [mealId, setMealId] = useState(current?.mealId ?? '');
  const [servings, setServings] = useState(String(current?.servings ?? 1));
  const [error, setError] = useState<string>();

  async function run(fn: () => Promise<unknown>) {
    setError(undefined);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <Modal title={`Plan ${slot} · ${date}`} onClose={onClose}>
      <Field label="Meal">
        <select value={mealId} onChange={(e) => setMealId(e.target.value)}>
          <option value="">Choose a meal…</option>
          {meals.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Servings">
        <input type="number" inputMode="decimal" min="0.25" step="0.25" value={servings} onChange={(e) => setServings(e.target.value)} />
      </Field>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        {current && (
          <button type="button" disabled={clear.isPending} onClick={() => run(() => clear.mutateAsync({ date, slot }))}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="primary"
          disabled={!mealId || !(Number(servings) > 0) || set.isPending}
          onClick={() => run(() => set.mutateAsync({ date, slot, mealId, servings: Number(servings) }))}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

/** "Assign meal" control for meal blocks, rendered in the block details dialog. */
export function MealAssignAction({ block }: { block: Block }) {
  const tz = useTimezone();
  const [open, setOpen] = useState(false);
  const date = localDateOf(new Date(block.start), tz);
  const plan = useMealPlan(weekStartOf(new Date(block.start), tz)).data;
  if (block.category !== 'meal' || !block.mealSlot) return null;
  const current = plan?.find((e) => e.date === date && e.slot === block.mealSlot);
  return (
    <>
      <div className="form-actions">
        <button type="button" onClick={() => setOpen(true)}>
          {current ? `Meal: ${current.meal.name} (change)` : 'Assign meal'}
        </button>
      </div>
      {open && <MealAssignModal date={date} slot={block.mealSlot} current={current} onClose={() => setOpen(false)} />}
    </>
  );
}

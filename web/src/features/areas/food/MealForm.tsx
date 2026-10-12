import { useState, type FormEvent } from 'react';
import type { Meal, MealInput, MealUpdateInput } from '@life-tracker/shared';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { useCreateMeal, useUpdateMeal } from '../../../api/hooks/food';
import { useToast } from '../../../components/Toast';

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function MealForm({ meal, onClose }: { meal?: Meal; onClose: () => void }) {
  const create = useCreateMeal();
  const update = useUpdateMeal();
  const toast = useToast();
  const [name, setName] = useState(meal?.name ?? '');
  const [kcal, setKcal] = useState(meal ? String(meal.kcal) : '');
  const [protein, setProtein] = useState(meal ? String(meal.proteinG) : '');
  const [carbs, setCarbs] = useState(meal?.carbsG != null ? String(meal.carbsG) : '');
  const [fat, setFat] = useState(meal?.fatG != null ? String(meal.fatG) : '');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const k = num(kcal);
    const p = num(protein);
    if (!name.trim()) return setError('Name is required');
    if (k === undefined || p === undefined) return setError('Calories and protein are required');
    // When editing, an emptied field is sent as null so the server clears it; when creating it is omitted.
    const empty = meal ? null : undefined;
    const input: MealUpdateInput = { name: name.trim(), kcal: k, proteinG: p, carbsG: num(carbs) ?? empty, fatG: num(fat) ?? empty };
    try {
      if (meal) await update.mutateAsync({ id: meal.id, ...input });
      else await create.mutateAsync(input as MealInput);
      onClose();
    } catch (err) {
      toast.showError(err, 'Could not save meal');
    }
  };

  return (
    <Modal title={meal ? 'Edit meal' : 'New meal'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Calories (kcal)">
          <input type="number" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Field>
        <Field label="Protein (g)">
          <input type="number" min="0" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </Field>
        <Field label="Carbs (g)">
          <input type="number" min="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </Field>
        <Field label="Fat (g)">
          <input type="number" min="0" value={fat} onChange={(e) => setFat(e.target.value)} />
        </Field>
        <div className="food-actions">
          <button type="submit" className="primary">Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

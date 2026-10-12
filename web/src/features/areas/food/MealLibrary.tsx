import { useState } from 'react';
import type { Meal } from '@life-tracker/shared';
import { useArchiveMeal, useMeals } from '../../../api/hooks/food';
import { useToast } from '../../../components/Toast';
import { MealForm } from './MealForm';

export function MealLibrary() {
  const { data: meals, isPending, isError } = useMeals();
  const archive = useArchiveMeal();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Meal | 'new' | null>(null);

  if (isPending) return <p className="muted">Loading…</p>;
  if (isError) return <p className="error">Could not load meals.</p>;

  const q = search.trim().toLowerCase();
  const shown = meals.filter((m) => m.name.toLowerCase().includes(q));

  const onArchive = (m: Meal) =>
    archive.mutate(m.id, { onError: (e) => toast.showError(e, 'Could not archive') });

  return (
    <div className="food-stack">
      <div className="food-actions">
        <input type="search" aria-label="Search meals" placeholder="Search meals" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="primary" onClick={() => setEditing('new')}>Add meal</button>
      </div>
      <div className="card">
        {shown.length === 0 && <p className="muted">No meals found.</p>}
        {shown.map((m) => (
          <div key={m.id} className="food-row">
            <div>
              <strong>{m.name}</strong>
              <div className="muted">
                {m.kcal} kcal · {m.proteinG} g protein
                {m.carbsG != null && ` · ${m.carbsG} g carbs`}
                {m.fatG != null && ` · ${m.fatG} g fat`}
              </div>
            </div>
            <div className="food-actions">
              <button aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}>Edit</button>
              <button aria-label={`Archive ${m.name}`} onClick={() => onArchive(m)}>Archive</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <MealForm meal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

import { addDays, weekDates, weekStartOf, type MealSlot } from '@life-tracker/shared';
import { useState } from 'react';
import { useMealPlan, useRepeatMealPlan, type MealPlanEntry } from '../../../api/hooks/mealPlan';
import { useTimezone } from '../../../api/hooks/settings';
import { useToast } from '../../../components/Toast';
import { MealAssignModal } from '../../week/MealAssignModal';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export function MealPlanTab() {
  const tz = useTimezone();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date(), tz));
  const [editing, setEditing] = useState<{ date: string; slot: MealSlot }>();
  const { data: plan = [], isPending } = useMealPlan(weekStart);
  const repeat = useRepeatMealPlan();
  const dates = weekDates(weekStart);
  const entry = (date: string, slot: MealSlot): MealPlanEntry | undefined => plan.find((e) => e.date === date && e.slot === slot);

  function totals(date: string) {
    let kcal = 0;
    let protein = 0;
    for (const e of plan) {
      if (e.date !== date) continue;
      kcal += e.meal.kcal * e.servings;
      protein += e.meal.proteinG * e.servings;
    }
    return { kcal: Math.round(kcal), protein: Math.round(protein) };
  }

  function onRepeat() {
    repeat.mutate(weekStart, {
      onSuccess: (r) => toast.show(`Copied ${r.copied} meals`),
      onError: (e) => toast.showError(e, 'Could not copy last week'),
    });
  }

  return (
    <div className="food-stack">
      <div className="food-actions">
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
          ‹
        </button>
        <span>
          {dates[0]} – {dates[6]}
        </span>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
          ›
        </button>
        <button type="button" onClick={onRepeat} disabled={repeat.isPending}>
          Repeat last week
        </button>
      </div>
      {isPending ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="plan-grid">
            <thead>
              <tr>
                <th scope="col">Day</th>
                {SLOTS.map((s) => (
                  <th key={s} scope="col" style={{ textTransform: 'capitalize' }}>
                    {s}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => {
                const t = totals(d);
                return (
                  <tr key={d}>
                    <th scope="row">{d}</th>
                    {SLOTS.map((s) => {
                      const e = entry(d, s);
                      return (
                        <td key={s}>
                          <button type="button" aria-label={`${d} ${s}`} onClick={() => setEditing({ date: d, slot: s })}>
                            {e ? (
                              <>
                                <strong>{e.meal.name}</strong>
                                <br />
                                <span className="muted">
                                  ×{e.servings} · {Math.round(e.meal.kcal * e.servings)} kcal
                                </span>
                              </>
                            ) : (
                              <span className="muted">+</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td aria-label={`${d} total`}>
                      {t.kcal} kcal · {t.protein} g
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <MealAssignModal {...editing} current={entry(editing.date, editing.slot)} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

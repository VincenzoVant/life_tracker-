import { useState, type ReactNode } from 'react';
import { MealLibrary } from './MealLibrary';
import { MealLogDay } from './MealLogDay';
import { MealPlanTab } from './MealPlanTab';
import './food.css';

interface FoodTab {
  key: string;
  label: string;
  render: () => ReactNode;
}

const TABS: FoodTab[] = [
  { key: 'log', label: 'Log', render: () => <MealLogDay /> },
  { key: 'library', label: 'Library', render: () => <MealLibrary /> },
  { key: 'plan', label: 'Plan', render: () => <MealPlanTab /> },
];

export function FoodPage() {
  const [active, setActive] = useState(TABS[0]!.key);
  const tab = TABS.find((t) => t.key === active) ?? TABS[0]!;
  return (
    <section>
      <h1>Food</h1>
      <div className="food-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab.key} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab.render()}</div>
    </section>
  );
}

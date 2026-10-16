import { Link } from 'react-router';
import { AreaTabs } from '../../../components/planning';
import { MealPlanTab } from './MealPlanTab';
import { MealTimesTab } from './MealTimesTab';
import { NutritionGoalsTab } from './NutritionGoalsTab';
import '../areas.css';
import './meals.css';

export function MealsPage() {
  return (
    <section>
      <div className="area-head">
        <h1>Meals</h1>
        <Link to="/areas/food">Food log</Link>
      </div>
      <AreaTabs
        tabs={[
          { key: 'times', label: 'Meal times', render: () => <MealTimesTab /> },
          { key: 'menu', label: 'Menu', render: () => <MealPlanTab /> },
          { key: 'goals', label: 'Nutrition goals', render: () => <NutritionGoalsTab /> },
        ]}
      />
    </section>
  );
}

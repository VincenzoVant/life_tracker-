import { Link } from 'react-router';
import { AreaTabs } from '../../../components/planning';
import { MealLibrary } from './MealLibrary';
import { MealLogDay } from './MealLogDay';
import '../areas.css';
import './food.css';

export function FoodPage() {
  return (
    <section>
      <div className="area-head">
        <h1>Food</h1>
        <Link to="/areas/meals">Plan your menu in Meals</Link>
      </div>
      <AreaTabs
        tabs={[
          { key: 'log', label: 'Log', render: () => <MealLogDay /> },
          { key: 'library', label: 'Library', render: () => <MealLibrary /> },
        ]}
      />
    </section>
  );
}

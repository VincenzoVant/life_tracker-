import { Link } from 'react-router';
import './areas.css';

const AREAS = [
  { to: '/areas/studies', title: 'Studies', blurb: 'Courses and weekly study hours' },
  { to: '/areas/work', title: 'Work', blurb: 'This week’s work blocks' },
  { to: '/areas/startup', title: 'Startup', blurb: 'Tasks and milestones' },
  { to: '/areas/workouts', title: 'Workouts', blurb: 'Sessions and lifts' },
  { to: '/areas/food', title: 'Food', blurb: 'Meals and nutrition' },
];

export function AreasPage() {
  return (
    <div>
      <h1>Areas</h1>
      <div className="area-grid">
        {AREAS.map((a) => (
          <Link key={a.to} to={a.to} className="card area-card">
            <h2>{a.title}</h2>
            <span className="muted">{a.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

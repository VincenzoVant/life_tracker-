import { Link } from 'react-router';
import './areas.css';

const AREAS = [
  { to: '/areas/this-week', title: 'This week', blurb: 'Projects, startup, fun and relax time' },
  { to: '/areas/classes', title: 'Classes', blurb: 'Your fixed class schedule and buffers' },
  { to: '/areas/studies', title: 'Studies', blurb: 'What and when you study' },
  { to: '/areas/workouts', title: 'Workouts', blurb: 'Gym schedule, sessions and lifts' },
  { to: '/areas/meals', title: 'Meals', blurb: 'Meal times, prep and the weekly menu' },
  { to: '/areas/food', title: 'Food', blurb: 'Food log and nutrition' },
  { to: '/areas/startup', title: 'Startup', blurb: 'Tasks and milestones' },
  { to: '/areas/work', title: 'Work', blurb: 'This week’s work blocks' },
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

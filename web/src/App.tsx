import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AuthGate } from './features/auth/AuthGate';
import { AreasPage } from './features/areas/AreasPage';
import { FoodPage } from './features/areas/food/FoodPage';
import { ReviewPage } from './features/review/ReviewPage';
import { StartupPage } from './features/areas/startup/StartupPage';
import { StudiesPage } from './features/areas/studies/StudiesPage';
import { TodayPage } from './features/today/TodayPage';
import { TopLiftsPage } from './features/areas/workouts/TopLiftsPage';
import { WorkPage } from './features/areas/work/WorkPage';
import { WorkoutsPage } from './features/areas/workouts/WorkoutsPage';

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Single routes list: later tasks replace the placeholder elements (and Stage 2 adds '/week').
export const routes: Array<{ path: string; element: ReactElement }> = [
  { path: '/', element: <TodayPage /> },
  { path: '/review', element: <ReviewPage /> },
  { path: '/areas', element: <AreasPage /> },
  { path: '/areas/studies', element: <StudiesPage /> },
  { path: '/areas/work', element: <WorkPage /> },
  { path: '/areas/startup', element: <StartupPage /> },
  { path: '/areas/workouts', element: <WorkoutsPage /> },
  { path: '/areas/workouts/lifts', element: <TopLiftsPage /> },
  { path: '/areas/food', element: <FoodPage /> },
  { path: '/dashboard', element: <Placeholder title="Dashboard" /> },
  { path: '/settings', element: <Placeholder title="Settings" /> },
];

export function App() {
  return (
    <AuthGate>
      <Layout>
        <Routes>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<Placeholder title="Not found" />} />
        </Routes>
      </Layout>
    </AuthGate>
  );
}

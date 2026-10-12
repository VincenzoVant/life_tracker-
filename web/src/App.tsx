import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { TopLiftsPage } from './features/areas/workouts/TopLiftsPage';
import { WorkoutsPage } from './features/areas/workouts/WorkoutsPage';
import { AuthGate } from './features/auth/AuthGate';

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Single routes list: later tasks replace the placeholder elements (and Stage 2 adds '/week').
export const routes: Array<{ path: string; element: ReactElement }> = [
  { path: '/', element: <Placeholder title="Today" /> },
  { path: '/review', element: <Placeholder title="Review" /> },
  { path: '/areas', element: <Placeholder title="Areas" /> },
  { path: '/areas/workouts', element: <WorkoutsPage /> },
  { path: '/areas/workouts/lifts', element: <TopLiftsPage /> },
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

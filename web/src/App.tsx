import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { FoodPage } from './features/areas/food/FoodPage';
import { AuthGate } from './features/auth/AuthGate';
import { ReviewPage } from './features/review/ReviewPage';
import { TodayPage } from './features/today/TodayPage';

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Single routes list: later tasks replace the placeholder elements (and Stage 2 adds '/week').
export const routes: Array<{ path: string; element: ReactElement }> = [
  { path: '/', element: <TodayPage /> },
  { path: '/review', element: <ReviewPage /> },
  { path: '/areas', element: <Placeholder title="Areas" /> },
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

import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { AuthGate } from './features/auth/AuthGate';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SettingsPage } from './features/settings/SettingsPage';

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Single routes list: later tasks replace the placeholder elements (and Stage 2 adds '/week').
export const routes: Array<{ path: string; element: ReactElement }> = [
  { path: '/', element: <Placeholder title="Today" /> },
  { path: '/review', element: <Placeholder title="Review" /> },
  { path: '/areas', element: <Placeholder title="Areas" /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <SettingsPage /> },
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

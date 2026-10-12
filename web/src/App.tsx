import type { ReactElement, ReactNode } from "react";
import { Route, Routes } from "react-router";
import { OfflineScreen } from "./components/OfflineScreen";
import { useServerHealth } from "./hooks/useServerHealth";
import { Layout } from "./components/Layout";
import { AuthGate } from "./features/auth/AuthGate";
import { AreasPage } from "./features/areas/AreasPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { FoodPage } from "./features/areas/food/FoodPage";
import { QuickAddPage } from "./features/quickAdd/QuickAddPage";
import { ReplanPage } from "./features/replan/ReplanPage";
import { ReviewPage } from "./features/review/ReviewPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { StartupPage } from "./features/areas/startup/StartupPage";
import { StudiesPage } from "./features/areas/studies/StudiesPage";
import { WeekPage } from './features/week/WeekPage';
import { TodayPage } from "./features/today/TodayPage";
import { TopLiftsPage } from "./features/areas/workouts/TopLiftsPage";
import { WorkPage } from "./features/areas/work/WorkPage";
import { WorkoutsPage } from "./features/areas/workouts/WorkoutsPage";

function Placeholder({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// Single routes list: later tasks replace the placeholder elements (and Stage 2 adds '/week').
export const routes: Array<{ path: string; element: ReactElement }> = [
  { path: "/", element: <TodayPage /> },
  { path: "/week", element: <WeekPage /> },
  { path: "/quick-add", element: <QuickAddPage /> },
  { path: "/replan/:planId", element: <ReplanPage /> },
  { path: "/review", element: <ReviewPage /> },
  { path: "/areas", element: <AreasPage /> },
  { path: "/areas/studies", element: <StudiesPage /> },
  { path: "/areas/work", element: <WorkPage /> },
  { path: "/areas/startup", element: <StartupPage /> },
  { path: "/areas/workouts", element: <WorkoutsPage /> },
  { path: "/areas/workouts/lifts", element: <TopLiftsPage /> },
  { path: "/areas/food", element: <FoodPage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/settings", element: <SettingsPage /> },
];

function OfflineGate({ children }: { children: ReactNode }) {
  const { status, retry } = useServerHealth();
  return status === "unreachable" ? (
    <OfflineScreen onRetry={retry} />
  ) : (
    <>{children}</>
  );
}

export function App() {
  return (
    <OfflineGate>
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
    </OfflineGate>
  );
}

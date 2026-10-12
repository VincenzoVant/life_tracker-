import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DashboardPage } from '../src/features/dashboard/DashboardPage';
import { MealLogDay } from '../src/features/areas/food/MealLogDay';
import { MealPlanTab } from '../src/features/areas/food/MealPlanTab';
import { StartupPage } from '../src/features/areas/startup/StartupPage';
import { StudiesPage } from '../src/features/areas/studies/StudiesPage';
import { TopLiftsPage } from '../src/features/areas/workouts/TopLiftsPage';
import { WorkPage } from '../src/features/areas/work/WorkPage';
import { WorkoutsPage } from '../src/features/areas/workouts/WorkoutsPage';
import { ReviewPage } from '../src/features/review/ReviewPage';
import { renderWithProviders } from './render';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Until settings load, "today"/"this week" would be computed in the browser's timezone, so nothing else may be requested.
test.each([
  ['Review', ReviewPage],
  ['Dashboard', DashboardPage],
  ['Studies', StudiesPage],
  ['Work', WorkPage],
  ['Startup', StartupPage],
  ['Workouts', WorkoutsPage],
  ['Top lifts', TopLiftsPage],
  ['Meal log', MealLogDay],
  ['Meal plan', MealPlanTab],
])('%s waits for settings before requesting date-dependent data', async (_name, Page) => {
  const fetchMock = vi.fn((..._args: unknown[]) => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<Page />);
  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  const paths = fetchMock.mock.calls.map((c) => String(c[0]));
  expect(paths).toEqual(['/api/settings']);
});

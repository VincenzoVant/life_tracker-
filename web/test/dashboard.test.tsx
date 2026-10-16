import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DashboardPage } from '../src/features/dashboard/DashboardPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const metric = (goal: number | null, planned: number, actual: number) => ({ goal, planned, actual });
const progress = (weekStart: string) => ({
  weekStart,
  study: [{ courseId: 'c1', name: 'Algorithms', color: '#3f51b5', ...metric(360, 300, 180) }],
  startup: metric(600, 540, 120),
  projects: [{ projectId: 'p1', title: 'Read a novel', kind: 'relax', ...metric(180, 120, 60) }],
  work: { planned: 960, actual: 480 },
  workouts: {
    total: metric(4, 4, 2),
    byType: { gym: metric(2, 2, 1), cardio: metric(1, 1, 1), sport: metric(null, 1, 0) },
  },
  freeEvenings: { ...metric(2, 3, 1), freeDates: [] },
  nutrition: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((date, i) => ({
    date,
    kcal: 2000,
    proteinG: 100,
    kcalTarget: 2000,
    proteinTarget: 120,
    kcalOk: i === 0 ? true : i === 1 ? false : null,
    proteinOk: i === 0 ? false : null,
  })),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T19:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('DashboardPage', () => {
  test('renders course rows with actual/planned/goal hours and nutrition dots', async () => {
    mockApi({
      'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
      'GET /api/streaks': () => ({ reviewDays: 0, workoutWeeks: 0 }),
      'GET /api/progress/trends': () => [],
      'GET /api/progress/week': (_b, url) => progress(url.searchParams.get('weekStart')!),
    });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('img', { name: 'Algorithms: 3h actual · 5h planned · goal 6h' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Startup: 2h actual · 9h planned · goal 10h' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Read a novel: 1h actual · 2h planned · goal 3h' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Work: 8h actual · 16h planned · no goal' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Workouts: 2 actual · 4 planned · goal 4' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gym: 1 actual · 2 planned · goal 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Free evenings: 1 actual · 3 planned · goal 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Calories 2026-10-12: on target' })).toHaveClass('ok');
    expect(screen.getByRole('img', { name: 'Calories 2026-10-13: off target' })).toHaveClass('bad');
    const nullDot = screen.getByRole('img', { name: 'Calories 2026-10-14: no data' });
    expect(nullDot).not.toHaveClass('ok');
    expect(nullDot).not.toHaveClass('bad');
    expect(screen.getByRole('img', { name: 'Protein 2026-10-12: off target' })).toHaveClass('bad');
  });

  test('week switcher requests previous week progress', async () => {
    const user = userEvent.setup();
    const weeks: string[] = [];
    mockApi({
      'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
      'GET /api/streaks': () => ({ reviewDays: 0, workoutWeeks: 0 }),
      'GET /api/progress/trends': () => [],
      'GET /api/progress/week': (_b, url) => {
        weeks.push(url.searchParams.get('weekStart')!);
        return progress(url.searchParams.get('weekStart')!);
      },
    });
    renderWithProviders(<DashboardPage />);
    await screen.findByText('This week');
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('Week of 2026-10-05')).toBeInTheDocument();
    expect(weeks).toContain('2026-10-12');
    expect(weeks).toContain('2026-10-05');
    await user.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByText('Week of 2026-10-12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This week' })).not.toBeInTheDocument();
  });
});

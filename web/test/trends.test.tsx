import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { Sparkline } from '../src/features/dashboard/Sparkline';
import { StreakTiles } from '../src/features/dashboard/StreakTiles';
import { TrendsSection } from '../src/features/dashboard/TrendsSection';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const week = (weekStart: string, studyMin: number) => ({
  weekStart,
  studyMinutes: { goal: 360, actual: studyMin },
  startupMinutes: { goal: null, actual: 60 },
  workMinutes: { actual: 480 },
  workouts: { goal: 4, actual: 3 },
  freeEvenings: { goal: 2, actual: 1 },
  avgKcal: 2100,
  avgProteinG: null,
  daysKcalOk: 5,
  daysProteinOk: 4,
});

describe('trends and streaks', () => {
  test('streak tiles render counts', async () => {
    mockApi({ 'GET /api/streaks': () => ({ reviewDays: 5, workoutWeeks: 2 }) });
    renderWithProviders(<StreakTiles />);
    expect(await screen.findByText(/5-day review streak/)).toBeInTheDocument();
    expect(screen.getByText(/2-week workout streak/)).toBeInTheDocument();
  });

  test('trends default 12 weeks and switching to 4 refetches', async () => {
    const user = userEvent.setup();
    const seen: Array<string | null> = [];
    mockApi({
      'GET /api/progress/trends': (_b, url) => {
        seen.push(url.searchParams.get('weeks'));
        return [week('2026-09-28', 120), week('2026-10-05', 300)];
      },
    });
    renderWithProviders(<TrendsSection />);
    expect(await screen.findByRole('img', { name: 'Study hours: 5 this week' })).toBeInTheDocument();
    expect(seen).toEqual(['12']);
    expect(screen.getByRole('tab', { name: '12 weeks' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: '4 weeks' }));
    await waitFor(() => expect(seen).toEqual(['12', '4']));
    expect(screen.getByText('5h / goal 6h')).toBeInTheDocument();
  });

  test('sparkline aria-label reports latest value', () => {
    render(<Sparkline values={[1, 2, 3.25]} goal={[4, 4, null]} label="Workouts" />);
    expect(screen.getByRole('img', { name: 'Workouts: 3.3 this week' })).toBeInTheDocument();
  });
});

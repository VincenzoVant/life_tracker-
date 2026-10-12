import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { WorkPage } from '../src/features/areas/work/WorkPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';
import { AreasPage } from '../src/features/areas/AreasPage';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => vi.useRealTimers());

const block = (id: string, category: string, start: string, end: string, status: string) => ({ id, category, title: id, start, end, status });

test('work page sums planned and actual hours', async () => {
  mockApi({
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/blocks': () => [
      block('w1', 'work', '2026-10-13T16:00:00.000Z', '2026-10-13T20:00:00.000Z', 'done'),
      block('w2', 'work', '2026-10-14T16:00:00.000Z', '2026-10-14T19:30:00.000Z', 'committed'),
      block('s1', 'study', '2026-10-14T20:00:00.000Z', '2026-10-14T21:00:00.000Z', 'committed'),
    ],
    'GET /api/progress/week': () => ({ weekStart: '2026-10-12', work: { planned: 450, actual: 240 } }),
  });
  renderWithProviders(<WorkPage />);
  expect(await screen.findByText('7.5 h')).toBeInTheDocument();
  expect(screen.getByText('4.0 h')).toBeInTheDocument();
  expect(screen.getByText('2026-10-13')).toBeInTheDocument();
  expect(screen.getByText('09:00–13:00')).toBeInTheDocument();
  expect(screen.getByText('done')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

test('areas index links to every area page', () => {
  renderWithProviders(<AreasPage />);
  const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual(['/areas/studies', '/areas/work', '/areas/startup', '/areas/workouts', '/areas/food']);
});

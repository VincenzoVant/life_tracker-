import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { FoodPage } from '../src/features/areas/food/FoodPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const meal = (o: Record<string, unknown>) => ({ carbsG: null, fatG: null, notes: null, archived: false, ...o });
const oats = meal({ id: 'm1', name: 'Oats', kcal: 300, proteinG: 10, carbsG: 50 });
const chicken = meal({ id: 'm2', name: 'Chicken rice', kcal: 600, proteinG: 45 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T19:00:00Z'));
});

const base = (extra: Record<string, any> = {}) => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/goals': () => ({ dailyKcal: { target: 2000, tolerancePct: 10 }, dailyProteinG: 150 }),
  'GET /api/meals': () => [oats, chicken],
  'GET /api/meal-logs': () => [],
  ...extra,
});

test('logging saved meal with 1.5 servings posts mealId and servings', async () => {
  const { calls } = mockApi(base({ 'POST /api/meal-logs': () => ({ id: 'l1' }) }));
  renderWithProviders(<FoodPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add to lunch' }));
  await userEvent.selectOptions(await screen.findByLabelText('Meal'), 'm1');
  const servings = screen.getByLabelText('Servings');
  await userEvent.clear(servings);
  await userEvent.type(servings, '1.5');
  await userEvent.click(screen.getByRole('button', { name: 'Log' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy());
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ date: '2026-10-14', slot: 'lunch', mealId: 'm1', servings: 1.5 });
});

test('free text log posts kcal and proteinG', async () => {
  const { calls } = mockApi(base({ 'POST /api/meal-logs': () => ({ id: 'l1' }) }));
  renderWithProviders(<FoodPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add to snack' }));
  await userEvent.click(screen.getByRole('button', { name: 'Free text' }));
  await userEvent.type(screen.getByLabelText('What did you eat?'), 'Protein bar');
  await userEvent.type(screen.getByLabelText('Calories (kcal)'), '220');
  await userEvent.type(screen.getByLabelText('Protein (g)'), '20');
  await userEvent.click(screen.getByRole('button', { name: 'Log' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy());
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
    date: '2026-10-14',
    slot: 'snack',
    freeText: 'Protein bar',
    kcal: 220,
    proteinG: 20,
  });
});

test('daily totals vs targets render', async () => {
  mockApi(
    base({
      'GET /api/meal-logs': () => [
        { id: 'a', date: '2026-10-14', slot: 'breakfast', mealId: 'm1', freeText: null, servings: 1, kcal: 300, proteinG: 10, carbsG: null, fatG: null },
        { id: 'b', date: '2026-10-14', slot: 'dinner', mealId: null, freeText: 'Pasta', servings: 1, kcal: 700, proteinG: 30, carbsG: null, fatG: null },
      ],
    }),
  );
  renderWithProviders(<FoodPage />);
  expect(await screen.findByText('1000 / 2000 kcal')).toBeTruthy();
  expect(screen.getByText('40 / 150 g')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Calories' }).getAttribute('aria-valuenow')).toBe('1000');
  expect(screen.getByRole('progressbar', { name: 'Protein' }).getAttribute('aria-valuenow')).toBe('40');
  expect(screen.getByText('Pasta')).toBeTruthy();
});

test('library search filters by name; archive calls DELETE', async () => {
  const { calls } = mockApi(base({ 'DELETE /api/meals/m2': () => ({ ...chicken, archived: true }) }));
  renderWithProviders(<FoodPage />);
  await userEvent.click(screen.getByRole('tab', { name: 'Library' }));
  expect(await screen.findByText('Oats')).toBeTruthy();
  await userEvent.type(screen.getByLabelText('Search meals'), 'chick');
  expect(screen.queryByText('Oats')).toBeNull();
  const row = screen.getByText('Chicken rice').closest('.food-row') as HTMLElement;
  expect(within(row).getByText(/600 kcal · 45 g protein/)).toBeTruthy();
  await userEvent.click(within(row).getByRole('button', { name: 'Archive Chicken rice' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/meals/m2')).toBe(true));
});

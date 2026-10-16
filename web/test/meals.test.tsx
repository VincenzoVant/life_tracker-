import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES } from '@life-tracker/shared';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MealsPage } from '../src/features/areas/meals/MealsPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const D = DEFAULT_PREFERENCES;
const goals = {
  startupMinutes: 600, workoutsTotal: 3, workoutsByType: { gym: 2, cardio: null, sport: null }, freeEvenings: 2,
  dailyKcal: { target: 2000, tolerancePct: 10 }, dailyProteinG: 150,
};
const base = (extra: Record<string, any> = {}) => ({
  'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
  'GET /api/preferences': () => structuredClone(D),
  'GET /api/goals': () => structuredClone(goals),
  'GET /api/meal-plan': () => [],
  ...extra,
});
const patchCall = (calls: { method: string; body: unknown }[]) => calls.find((c) => c.method === 'PATCH')?.body as any;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') }));
afterEach(() => vi.useRealTimers());

test('meal times PATCH sends only the meal keys', async () => {
  const { calls } = mockApi(base({ 'PATCH /api/preferences': (b: any) => ({ ...D, ...b }) }));
  renderWithProviders(<MealsPage />);
  fireEvent.change(await screen.findByLabelText('Lunch time'), { target: { value: '13:00' } });
  const flex = screen.getByLabelText('Meal flex (min)');
  await userEvent.clear(flex);
  await userEvent.type(flex, '30');
  await userEvent.click(screen.getByRole('button', { name: 'Save meal times' }));
  await waitFor(() => expect(patchCall(calls)).toBeTruthy());
  const body = patchCall(calls);
  expect(Object.keys(body).sort()).toEqual(['mealFlexMinutes', 'mealPrep', 'meals', 'mealsByDay']);
  expect(body.meals.lunch).toEqual({ time: '13:00', minutes: 30 });
  expect(body.mealFlexMinutes).toBe(30);
  expect(body.mealsByDay).toEqual([]);
  expect(await screen.findByText('Meal times saved')).toBeInTheDocument();
});

test('add a weekend override with a skipped breakfast and a brunch', async () => {
  const { calls } = mockApi(base({ 'PATCH /api/preferences': (b: any) => ({ ...D, ...b }) }));
  renderWithProviders(<MealsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Add different days' }));
  expect(screen.getByRole('button', { name: 'Days 1: Saturday' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByLabelText('Days 1: skip breakfast'));
  expect(screen.queryByLabelText('Days 1 breakfast time')).toBeNull();
  fireEvent.change(screen.getByLabelText('Days 1 lunch time'), { target: { value: '10:30' } });
  const dur = screen.getByLabelText('Days 1 lunch duration (min)');
  await userEvent.clear(dur);
  await userEvent.type(dur, '45');

  expect(screen.getByLabelText('Saturday breakfast')).toHaveTextContent('Skipped');
  expect(screen.getByLabelText('Sunday lunch')).toHaveTextContent('10:30 · 45 min');
  expect(screen.getByLabelText('Friday breakfast')).toHaveTextContent('08:00 · 20 min');

  await userEvent.click(screen.getByRole('button', { name: 'Save meal times' }));
  await waitFor(() => expect(patchCall(calls)).toBeTruthy());
  expect(patchCall(calls).mealsByDay).toEqual([
    { days: [6, 7], breakfast: null, lunch: { time: '10:30', minutes: 45 }, dinner: D.meals.dinner },
  ]);
});

test('unskipping restores the usual time and server field errors show next to the override', async () => {
  const stored = { ...structuredClone(D), mealsByDay: [{ days: [3], breakfast: null, lunch: D.meals.lunch, dinner: D.meals.dinner }] };
  mockApi(base({
    'GET /api/preferences': () => stored,
    'PATCH /api/preferences': () => ({
      status: 400,
      body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { 'mealsByDay.0.days': 'Pick at least one day' } } },
    }),
  }));
  renderWithProviders(<MealsPage />);
  expect(await screen.findByLabelText('Wednesday breakfast')).toHaveTextContent('Skipped');
  await userEvent.click(screen.getByLabelText('Days 1: skip breakfast'));
  expect(screen.getByLabelText('Days 1 breakfast time')).toHaveValue('08:00');
  await userEvent.click(screen.getByRole('button', { name: 'Days 1: Wednesday' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save meal times' }));
  const group = screen.getByRole('group', { name: 'Days 1' });
  expect(await within(group).findByText('Pick at least one day')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove days 1' }));
  expect(screen.getByText('Same meal times every day.')).toBeInTheDocument();
});

test('menu tab renders the weekly menu', async () => {
  mockApi(base());
  renderWithProviders(<MealsPage />);
  await userEvent.click(await screen.findByRole('tab', { name: 'Menu' }));
  expect(await screen.findByRole('button', { name: '2026-10-14 dinner' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Repeat last week' })).toBeInTheDocument();
});

test('nutrition goals PUT keeps the other goals', async () => {
  const { calls } = mockApi(base({ 'PUT /api/goals': (b: any) => b }));
  renderWithProviders(<MealsPage />);
  await userEvent.click(await screen.findByRole('tab', { name: 'Nutrition goals' }));
  const kcal = await screen.findByLabelText('Daily calories');
  await userEvent.clear(kcal);
  await userEvent.type(kcal, '2200');
  await userEvent.click(screen.getByLabelText('No goal for Daily protein (g)'));
  await userEvent.click(screen.getByRole('button', { name: 'Save nutrition goals' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeTruthy());
  expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
    ...goals,
    dailyKcal: { target: 2200, tolerancePct: 10 },
    dailyProteinG: null,
  });
});

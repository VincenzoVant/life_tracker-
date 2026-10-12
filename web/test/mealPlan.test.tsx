import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES, type Block } from '@life-tracker/shared';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FoodPage } from '../src/features/areas/food/FoodPage';
import { ReviewPage } from '../src/features/review/ReviewPage';
import { MealAssignAction } from '../src/features/week/MealAssignModal';
import { WeekPage } from '../src/features/week/WeekPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

function block(over: Partial<Block> & { id: string }): Block {
  return {
    category: 'meal', title: 'Lunch', start: '2026-10-14T19:30:00.000Z', end: '2026-10-14T20:00:00.000Z', status: 'committed',
    actualMinutes: null, source: 'planner', locked: false, courseId: null, startupTaskId: null, workoutType: null, mealSlot: 'lunch',
    fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null, gcalSyncedAt: null, notes: null,
    createdAt: '', updatedAt: '', ...over,
  };
}
const bowl = { id: 'm1', name: 'Chicken bowl', kcal: 600, proteinG: 45, carbsG: null, fatG: null, notes: null, archived: false };
const entry = { id: 'e1', date: '2026-10-14', slot: 'lunch', mealId: 'm1', servings: 2, meal: bowl };
const settings = () => ({ timezone: 'America/Los_Angeles' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
});

test('assign meal from week block details PUTs entry', async () => {
  const { calls } = mockApi({
    'GET /api/settings': settings,
    'GET /api/preferences': () => DEFAULT_PREFERENCES,
    'GET /api/blocks': () => [block({ id: 'b1' })],
    'GET /api/plans/draft': () => null,
    'GET /api/meal-plan': () => [],
    'GET /api/meals': () => [bowl],
    'PUT /api/meal-plan/2026-10-14/lunch': () => entry,
  });
  renderWithProviders(<WeekPage detailsActions={(b) => <MealAssignAction block={b} />} />);
  await userEvent.click(await screen.findByText('Lunch'));
  await userEvent.click(await screen.findByRole('button', { name: 'Assign meal' }));
  await userEvent.selectOptions(await screen.findByLabelText('Meal'), 'm1');
  const servings = screen.getByLabelText('Servings');
  await userEvent.clear(servings);
  await userEvent.type(servings, '2');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeTruthy());
  expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ mealId: 'm1', servings: 2 });
});

test('plan tab repeat last week shows copied count and sums day totals', async () => {
  const { calls } = mockApi({
    'GET /api/settings': settings,
    'GET /api/goals': () => ({}),
    'GET /api/meals': () => [bowl],
    'GET /api/meal-logs': () => [],
    'GET /api/meal-plan': () => [entry],
    'POST /api/meal-plan/repeat': () => ({ copied: 5 }),
  });
  renderWithProviders(<FoodPage />);
  await userEvent.click(await screen.findByRole('tab', { name: 'Plan' }));
  const cell = await screen.findByRole('button', { name: '2026-10-14 lunch' });
  expect(within(cell).getByText(/1200 kcal/)).toBeInTheDocument();
  expect(screen.getByLabelText('2026-10-14 total')).toHaveTextContent('1200 kcal · 90 g');
  await userEvent.click(screen.getByRole('button', { name: 'Repeat last week' }));
  expect(await screen.findByText('Copied 5 meals')).toBeInTheDocument();
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ weekStart: '2026-10-12' });
});

test('review meal row sends ateAsPlanned true by default', async () => {
  const { calls } = mockApi({
    'GET /api/settings': settings,
    'GET /api/review': () => ({
      date: '2026-10-14',
      pending: [{ ...block({ id: 'b1' }), plannedMeal: { mealId: 'm1', name: 'Chicken bowl', servings: 1 } }],
      reviewed: [],
      completedAt: null,
    }),
    'POST /api/review': () => ({ date: '2026-10-14', progress: { weekStart: '2026-10-12', study: [], startup: { goal: null, planned: 0, actual: 0 }, work: { planned: 0, actual: 0 }, workouts: { total: { goal: null, planned: 0, actual: 0 }, byType: {} }, freeEvenings: { goal: null, planned: 0, actual: 0, freeDates: [] }, nutrition: [] } }),
  });
  renderWithProviders(<ReviewPage />);
  const row = await screen.findByRole('group', { name: 'Lunch' });
  await userEvent.click(within(row).getByRole('button', { name: /done/i }));
  expect(within(row).getByLabelText('Ate as planned (Chicken bowl ×1)')).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy());
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
    date: '2026-10-14',
    entries: [{ blockId: 'b1', outcome: 'done', ateAsPlanned: true }],
    unplanned: [],
  });
});

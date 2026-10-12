import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { GoalsForm } from '../src/features/settings/GoalsForm';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const goals = {
  startupMinutes: 600,
  workoutsTotal: 4,
  workoutsByType: { gym: 2, cardio: null, sport: null },
  freeEvenings: 2,
  dailyKcal: { target: 2200, tolerancePct: 10 },
  dailyProteinG: 120,
};

test('hours convert to whole minutes and a blank tolerance falls back to 10', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ 'GET /api/goals': () => goals, 'PUT /api/goals': (b) => b });
  renderWithProviders(<GoalsForm />);
  const startup = await screen.findByLabelText('Startup (hours per week)');
  await user.clear(startup);
  await user.type(startup, '2.05');
  await user.clear(screen.getByLabelText('Calorie tolerance (%)'));
  await user.click(screen.getByRole('button', { name: 'Save goals' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeDefined());
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ startupMinutes: 123, dailyKcal: { target: 2200, tolerancePct: 10 } });
});

const allOff = {
  startupMinutes: null,
  workoutsTotal: null,
  workoutsByType: { gym: null, cardio: null, sport: null },
  freeEvenings: null,
  dailyKcal: null,
  dailyProteinG: null,
};

test('typing a startup value without touching No goal saves it', async () => {
  const user = userEvent.setup();
  const { calls } = mockApi({ 'GET /api/goals': () => allOff, 'PUT /api/goals': (b) => b });
  renderWithProviders(<GoalsForm />);
  const startup = await screen.findByLabelText('Startup (hours per week)');
  expect(startup).toBeEnabled();
  await user.type(startup, '15');
  await user.click(screen.getByRole('button', { name: 'Save goals' }));
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeDefined());
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ startupMinutes: 900, workoutsTotal: null });
});

test('typing unticks No goal, clearing re-ticks it, ticking clears the value', async () => {
  const user = userEvent.setup();
  mockApi({ 'GET /api/goals': () => allOff });
  renderWithProviders(<GoalsForm />);
  const input = await screen.findByLabelText('Workouts per week');
  const off = screen.getByLabelText('No goal for Workouts per week');
  expect(off).toBeChecked();
  await user.type(input, '3');
  expect(off).not.toBeChecked();
  await user.clear(input);
  expect(off).toBeChecked();
  await user.type(input, '3');
  await user.click(off);
  expect(input).toHaveValue(null);
});

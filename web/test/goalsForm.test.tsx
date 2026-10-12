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

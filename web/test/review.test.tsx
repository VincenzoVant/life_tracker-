import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Block } from '@life-tracker/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ReviewPage } from '../src/features/review/ReviewPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

function block(over: Partial<Block> & { id: string }): Block {
  return {
    category: 'study', title: over.id, start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:00:00.000Z', status: 'committed',
    actualMinutes: null, source: 'planner', locked: false, courseId: null, startupTaskId: null, workoutType: null, mealSlot: null,
    fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null, gcalSyncedAt: null, notes: null,
    createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z', ...over,
  };
}

const metric = (actual: number, goal: number | null) => ({ goal, planned: goal ?? 0, actual });
const progress = {
  weekStart: '2026-10-12',
  study: [{ courseId: 'c1', name: 'Algorithms', color: '#3f51b5', ...metric(150, 300) }],
  startup: metric(60, 120),
  work: { planned: 0, actual: 0 },
  workouts: { total: metric(2, 3), byType: { gym: metric(1, 1), cardio: metric(1, 1), sport: metric(0, 1) } },
  freeEvenings: { ...metric(0, 0), freeDates: [] },
  nutrition: [],
};

const settings = () => ({ timezone: 'America/Los_Angeles' });

beforeEach(() => vi.setSystemTime(new Date('2026-10-14T19:00:00Z')));
afterEach(() => vi.useRealTimers());

describe('ReviewPage', () => {
  test('submit disabled until all rows have an outcome; payload matches selections', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/settings': settings,
      'GET /api/review': () => ({
        date: '2026-10-14',
        pending: [block({ id: 'b1' }), block({ id: 'b2', end: '2026-10-14T17:30:00.000Z' })],
        reviewed: [],
        completedAt: null,
      }),
      'POST /api/review': () => ({ date: '2026-10-14', progress }),
    });
    renderWithProviders(<ReviewPage />);
    const r1 = await screen.findByRole('group', { name: 'b1' });
    const r2 = screen.getByRole('group', { name: 'b2' });
    const submit = screen.getByRole('button', { name: 'Submit review' });
    expect(submit).toBeDisabled();

    await user.click(within(r1).getByRole('button', { name: /done/i }));
    expect(submit).toBeDisabled();
    await user.click(within(r2).getByRole('button', { name: /partly/i }));
    expect(within(r2).getByLabelText('Minutes done')).toHaveValue(45);
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      date: '2026-10-14',
      entries: [{ blockId: 'b1', outcome: 'done' }, { blockId: 'b2', outcome: 'partial', actualMinutes: 45 }],
      unplanned: [],
    }));
  });

  test('partial minutes > duration shows server field error inline', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/settings': settings,
      'GET /api/review': () => ({ date: '2026-10-14', pending: [block({ id: 'b1' })], reviewed: [], completedAt: null }),
      'POST /api/review': () => ({
        status: 400,
        body: { error: { code: 'VALIDATION', message: 'Invalid', fields: { 'entries.0.actualMinutes': 'Cannot exceed the block duration (60 min)' } } },
      }),
    });
    renderWithProviders(<ReviewPage />);
    const row = await screen.findByRole('group', { name: 'b1' });
    await user.click(within(row).getByRole('button', { name: /partly/i }));
    await user.clear(within(row).getByLabelText('Minutes done'));
    await user.type(within(row).getByLabelText('Minutes done'), '90');
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(await within(row).findByText('Cannot exceed the block duration (60 min)')).toBeInTheDocument();
  });

  test('cardio workout details and startup task completion are included', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/settings': settings,
      'GET /api/review': () => ({
        date: '2026-10-14',
        pending: [
          block({ id: 'run', category: 'workout', workoutType: 'cardio' }),
          block({ id: 'ship', category: 'startup', startupTaskId: 't1' }),
        ],
        reviewed: [],
        completedAt: null,
      }),
      'POST /api/review': () => ({ date: '2026-10-14', progress }),
    });
    renderWithProviders(<ReviewPage />);
    const run = await screen.findByRole('group', { name: 'run' });
    await user.click(within(run).getByRole('button', { name: /done/i }));
    await user.type(within(run).getByLabelText(/kind/i), 'run');
    await user.type(within(run).getByLabelText(/distance/i), '5');
    await user.selectOptions(within(run).getByLabelText('Intensity'), '4');
    await user.type(within(run).getByLabelText('Notes'), 'easy');

    const ship = screen.getByRole('group', { name: 'ship' });
    await user.click(within(ship).getByRole('button', { name: /done/i }));
    await user.click(within(ship).getByLabelText('Mark task done'));

    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      date: '2026-10-14',
      entries: [
        { blockId: 'run', outcome: 'done', workout: { cardioKind: 'run', distanceKm: 5, intensity: 4, notes: 'easy' } },
        { blockId: 'ship', outcome: 'done', completeStartupTask: true },
      ],
      unplanned: [],
    }));
  });

  test('after submit shows totals vs goals', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/settings': settings,
      'GET /api/review': () => ({ date: '2026-10-14', pending: [block({ id: 'b1' })], reviewed: [], completedAt: null }),
      'POST /api/review': () => ({ date: '2026-10-14', progress }),
    });
    renderWithProviders(<ReviewPage />);
    const row = await screen.findByRole('group', { name: 'b1' });
    await user.click(within(row).getByRole('button', { name: /skipped/i }));
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    const summary = await screen.findByRole('region', { name: 'Week summary' });
    expect(within(summary).getByText('Study: Algorithms: 150 / 300 min')).toBeInTheDocument();
    expect(within(summary).getByText('Startup: 60 / 120 min')).toBeInTheDocument();
    expect(within(summary).getByText('Workouts: 2 / 3')).toBeInTheDocument();
  });

  test('unplanned activity is added to the payload with UTC times', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/settings': settings,
      'GET /api/courses': () => [],
      'GET /api/review': () => ({ date: '2026-10-14', pending: [], reviewed: [], completedAt: null }),
      'POST /api/review': () => ({ date: '2026-10-14', progress }),
    });
    renderWithProviders(<ReviewPage />);
    await user.click(await screen.findByRole('button', { name: 'Add unplanned activity' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'Walk');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      date: '2026-10-14',
      entries: [],
      unplanned: [{ category: 'other', title: 'Walk', start: '2026-10-14T19:00:00.000Z', end: '2026-10-14T20:00:00.000Z' }],
    }));
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES, type Block } from '@life-tracker/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WeekPage } from '../src/features/week/WeekPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

function block(over: Partial<Block>): Block {
  return {
    id: 'b', category: 'other', title: 't', start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:00:00.000Z',
    status: 'committed', actualMinutes: null, source: 'manual', locked: false, courseId: null, startupTaskId: null,
    workoutType: null, mealSlot: null, fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null,
    gcalSyncedAt: null, notes: null, createdAt: '', updatedAt: '', ...over,
  };
}

// Week of Mon 2026-10-12 (PDT). Wed 14th and Thu 15th hold blocks.
const blocks = [
  block({ id: 'lec', title: 'Lecture', category: 'study', source: 'fixed', locked: true, start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:30:00.000Z' }),
  block({ id: 'run', title: 'Proposed run', category: 'workout', status: 'proposed', source: 'planner', start: '2026-10-15T00:00:00.000Z', end: '2026-10-15T01:00:00.000Z' }),
  block({ id: 'gone', title: 'Gone', status: 'removed' }),
];

let calls: ReturnType<typeof mockApi>['calls'];
function api() {
  ({ calls } = mockApi({
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/preferences': () => DEFAULT_PREFERENCES,
    'GET /api/blocks': () => blocks,
    'GET /api/plans/draft': () => null,
    'GET /api/meal-plan': () => [],
    'DELETE /api/blocks/lec': () => block({ id: 'lec', status: 'removed' }),
  }));
}

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
  setWidth(1200);
});
afterEach(() => {
  vi.useRealTimers();
  setWidth(1024);
});

describe('WeekPage', () => {
  test('week grid renders 7 columns with blocks in correct day column', async () => {
    api();
    renderWithProviders(<WeekPage />);
    const wed = await screen.findByRole('group', { name: 'Day 2026-10-14' });
    expect(screen.getAllByRole('group', { name: /^Day / })).toHaveLength(7);
    expect(within(wed).getByText('Lecture')).toBeInTheDocument();
    // 00:00Z on the 15th is 17:00 PDT on the 14th
    expect(within(wed).getByText('Proposed run')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Day 2026-10-15' })).queryByText('Proposed run')).not.toBeInTheDocument();
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  test('locked block shows lock icon; proposed block has dashed style and label', async () => {
    api();
    renderWithProviders(<WeekPage />);
    const lecture = (await screen.findByText('Lecture')).closest('button')!;
    expect(within(lecture).getByRole('img', { name: 'Locked' })).toBeInTheDocument();
    const run = screen.getByText('Proposed run').closest('button')!;
    expect(run.style.borderStyle).toBe('dashed');
    expect(within(run).getByText('Proposed')).toBeInTheDocument();
    expect(lecture.style.borderStyle).toBe('solid');
  });

  test('mobile width shows single day and next button advances', async () => {
    setWidth(375);
    api();
    renderWithProviders(<WeekPage />);
    expect(await screen.findByRole('heading', { name: 'Wed 14' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Week grid' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByRole('heading', { name: 'Thu 15' })).toBeInTheDocument();
    expect(screen.queryByText('Lecture')).not.toBeInTheDocument();
  });

  test('swipe left over 60px advances the day', async () => {
    setWidth(375);
    api();
    renderWithProviders(<WeekPage />);
    const list = (await screen.findByRole('heading', { name: 'Wed 14' })).closest('.day-view')!;
    fireEvent.touchStart(list, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByRole('heading', { name: 'Thu 15' })).toBeInTheDocument();
    fireEvent.touchStart(list, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(list, { changedTouches: [{ clientX: 130 }] });
    expect(screen.getByRole('heading', { name: 'Thu 15' })).toBeInTheDocument();
  });

  test('cancel occurrence on fixed block confirms and calls DELETE', async () => {
    api();
    renderWithProviders(<WeekPage />);
    await userEvent.click(await screen.findByText('Lecture'));
    const dialog = screen.getByRole('dialog', { name: 'Lecture' });
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel this occurrence' }));
    expect(screen.getByText('Cancel this class on 2026-10-14? Other weeks are not affected.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm cancel' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/blocks/lec')).toBe(true));
  });

  test('non-fixed block can be edited; slots render', async () => {
    api();
    renderWithProviders(
      <WeekPage header={() => <p>HEADER</p>} detailsActions={(b) => <p>extra {b.id}</p>} />,
    );
    expect(await screen.findByText('HEADER')).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Proposed run'));
    expect(screen.getByText('extra run')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit block' })).toBeInTheDocument();
  });

  test('details dialog follows the refetched block instead of going stale', async () => {
    api();
    const { queryClient } = renderWithProviders(<WeekPage />);
    await userEvent.click(await screen.findByText('Lecture'));
    expect(screen.getByRole('dialog', { name: 'Lecture' })).toBeInTheDocument();
    blocks[0] = { ...blocks[0]!, title: 'Lecture (moved room)' };
    await queryClient.invalidateQueries({ queryKey: ['blocks'] });
    expect(await screen.findByRole('dialog', { name: 'Lecture (moved room)' })).toBeInTheDocument();
    blocks[0] = { ...blocks[0]!, title: 'Lecture' };
  });
});

describe('overlap markers', () => {
  test('overlapping blocks show a warning marker on both cards', async () => {
    mockApi({
      'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
      'GET /api/preferences': () => DEFAULT_PREFERENCES,
      'GET /api/blocks': () => [
        block({ id: 'a', title: 'Class', start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T18:00:00.000Z' }),
        block({ id: 'b', title: 'Drinks', start: '2026-10-14T17:00:00.000Z', end: '2026-10-14T19:00:00.000Z' }),
        block({ id: 'c', title: 'Later', start: '2026-10-14T19:00:00.000Z', end: '2026-10-14T20:00:00.000Z' }),
      ],
      'GET /api/plans/draft': () => null,
      'GET /api/meal-plan': () => [],
    });
    renderWithProviders(<WeekPage />);
    for (const title of ['Class', 'Drinks']) {
      const card = (await screen.findByText(title)).closest('button')!;
      expect(within(card).getByTitle('Overlaps another block')).toBeInTheDocument();
    }
    expect(within(screen.getByText('Later').closest('button')!).queryByTitle('Overlaps another block')).not.toBeInTheDocument();
  });
});

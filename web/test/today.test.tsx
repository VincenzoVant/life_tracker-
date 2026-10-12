import { screen, within } from '@testing-library/react';
import type { Block } from '@life-tracker/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TodayPage } from '../src/features/today/TodayPage';
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

const blocks = [
  block({ id: '3', title: 'Evening run', category: 'workout', start: '2026-10-15T01:00:00.000Z', end: '2026-10-15T02:00:00.000Z' }),
  block({ id: '1', title: 'Morning lecture', category: 'study', start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:00:00.000Z', status: 'done' }),
  block({ id: '2', title: 'Pitch deck', category: 'startup', start: '2026-10-14T20:00:00.000Z', end: '2026-10-14T21:00:00.000Z' }),
  block({ id: '4', title: 'Gone', start: '2026-10-14T22:00:00.000Z', end: '2026-10-14T23:00:00.000Z', status: 'removed' }),
];

function api() {
  return mockApi({
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/blocks': () => blocks,
    'GET /api/progress/week': () => ({
      nutrition: [
        { date: '2026-10-13', kcal: 1, proteinG: 1, kcalTarget: 2400, proteinTarget: 150, kcalOk: null, proteinOk: null },
        { date: '2026-10-14', kcal: 1450, proteinG: 98, kcalTarget: 2400, proteinTarget: 150, kcalOk: null, proteinOk: null },
      ],
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('TodayPage', () => {
  test('today shows blocks in time order with category label and next up', async () => {
    api();
    renderWithProviders(<TodayPage />);
    const list = await screen.findByRole('list', { name: /today's blocks/i });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => within(i).getByText(/lecture|deck|run/i).textContent)).toEqual([
      'Morning lecture', 'Pitch deck', 'Evening run',
    ]);
    expect(within(items[0]!).getByText('Study')).toBeInTheDocument();
    expect(within(items[0]!).getByText('09:00–10:00')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('img', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
    // lecture is done, so next up is the first committed block that hasn't ended
    expect(within(screen.getByRole('region', { name: 'Next up' })).getByText('Pitch deck')).toBeInTheDocument();
  });

  test('review button is emphasized at/after 20:00 local', async () => {
    api();
    const { unmount } = renderWithProviders(<TodayPage />);
    expect(await screen.findByRole('link', { name: /end-of-day review/i })).not.toHaveClass('emphasized');
    unmount();
    vi.setSystemTime(new Date('2026-10-15T03:00:00Z')); // 20:00 PDT
    renderWithProviders(<TodayPage />);
    const link = await screen.findByRole('link', { name: /end-of-day review/i });
    expect(link).toHaveClass('emphasized');
    expect(link).toHaveAttribute('href', '/review');
  });

  test('macro summary shows 1450 / 2400 kcal and 98 / 150 g protein', async () => {
    api();
    renderWithProviders(<TodayPage />);
    const macros = await screen.findByRole('region', { name: 'Macros' });
    expect(await within(macros).findByText('1450 / 2400')).toBeInTheDocument();
    expect(within(macros).getByText('98 / 150')).toBeInTheDocument();
  });
});

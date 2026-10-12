import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PREFERENCES, type Block, type PlanDraft, type WeekProgress } from '@life-tracker/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WeekPage } from '../src/features/week/WeekPage';
import { mockApi, type Handler } from './mockApi';
import { renderWithProviders } from './render';

function proposed(): Block {
  return {
    id: 'p1', category: 'study', title: 'Econometrics', start: '2026-10-20T16:00:00.000Z', end: '2026-10-20T17:00:00.000Z',
    status: 'proposed', actualMinutes: null, source: 'planner', locked: false, courseId: 'c1', startupTaskId: null,
    workoutType: null, mealSlot: null, fixedEventId: null, planId: 'plan1', gcalEventId: null, gcalEtag: null,
    gcalSyncedAt: null, notes: null, createdAt: '', updatedAt: '',
  };
}

const draft: PlanDraft = {
  plan: {
    id: 'plan1', weekStart: '2026-10-19', mode: 'full', triggerBlockId: null, status: 'draft', createdAt: '',
    summary: {
      shortfalls: [
        { kind: 'study', courseName: 'Econometrics', courseId: 'c1', missing: 90, unit: 'minutes' },
        { kind: 'workout', workoutType: 'gym', missing: 1, unit: 'count' },
        { kind: 'free_evenings', missing: 1, unit: 'count' },
      ],
      reservedEvenings: ['2026-10-21'],
    },
  },
  blocks: [proposed()],
};

const progress: WeekProgress = {
  weekStart: '2026-10-19',
  study: [{ courseId: 'c1', name: 'Econometrics', color: '#000', goal: 300, planned: 210, actual: 0 }],
  startup: { goal: 360, planned: 120, actual: 0 },
  work: { planned: 0, actual: 0 },
  workouts: { total: { goal: 3, planned: 2, actual: 0 }, byType: {} as WeekProgress['workouts']['byType'] },
  freeEvenings: { goal: 2, planned: 1, actual: 0, freeDates: [] },
  nutrition: [],
};

let skipped = 0;
let hasDraft: boolean;
let calls: ReturnType<typeof mockApi>['calls'];
let progressUrls: string[];

function api(extra: Record<string, Handler> = {}) {
  progressUrls = [];
  ({ calls } = mockApi({
    'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }),
    'GET /api/preferences': () => DEFAULT_PREFERENCES,
    'GET /api/blocks': () => (hasDraft ? [proposed()] : []),
    'GET /api/meal-plan': () => [],
    'GET /api/plans/draft': () => (hasDraft ? draft : null),
    'GET /api/progress/week': (_b, url) => {
      progressUrls.push(url.search);
      return progress;
    },
    'POST /api/plans': () => {
      hasDraft = true;
      return { status: 201, body: draft };
    },
    'POST /api/plans/plan1/commit': () => {
      hasDraft = false;
      return { ...draft.plan, status: 'applied', skipped };
    },
    'POST /api/plans/plan1/discard': () => {
      hasDraft = false;
      return { ...draft.plan, status: 'discarded' };
    },
    ...extra,
  }));
}

beforeEach(() => {
  hasDraft = false;
  skipped = 0;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T19:00:00Z') });
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
});

async function goNextWeek() {
  await userEvent.click(await screen.findByRole('button', { name: 'Next week' }));
}

describe('planning flow', () => {
  test('Plan next week posts weekStart and shows draft panel with shortfalls', async () => {
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Plan next week' }));
    const panel = await screen.findByRole('complementary', { name: 'Draft plan' });
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/plans')!;
    expect(post.body).toEqual({ weekStart: '2026-10-19' });
    expect(within(panel).getByText("Can't fit: 1.5 h of Econometrics")).toBeInTheDocument();
    expect(within(panel).getByText("Can't fit: 1 gym session")).toBeInTheDocument();
    expect(within(panel).getByText('Only 1 of 2 free evenings')).toBeInTheDocument();
    expect(within(panel).getByText('Wed 21')).toBeInTheDocument();
    expect(screen.getByText('Draft — review and commit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan next week' })).not.toBeInTheDocument();
  });

  test('current week offers Plan this week', async () => {
    api();
    renderWithProviders(<WeekPage />);
    expect(await screen.findByRole('button', { name: 'Plan this week' })).toBeInTheDocument();
  });

  test('projection uses includeProposed=true', async () => {
    hasDraft = true;
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    const panel = await screen.findByRole('complementary', { name: 'Draft plan' });
    await within(panel).findByText('Econometrics: 3.5 h of 5 h');
    expect(within(panel).getByText('Workouts: 2 of 3')).toBeInTheDocument();
    expect(progressUrls.some((u) => u.includes('includeProposed=true') && u.includes('weekStart=2026-10-19'))).toBe(true);
  });

  test('commit calls commit endpoint, toasts and hides panel', async () => {
    hasDraft = true;
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/plans/plan1/commit' && c.method === 'POST')).toBe(true));
    expect(await screen.findByText('Week committed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Draft plan' })).not.toBeInTheDocument());
  });

  test('commit toast reports skipped blocks', async () => {
    hasDraft = true;
    skipped = 2;
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Commit' }));
    expect(
      await screen.findByText('Week committed — 2 blocks skipped because they were in the past or clashed with something new'),
    ).toBeInTheDocument();
  });

  test('discard requires confirmation', async () => {
    hasDraft = true;
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(calls.some((c) => c.path === '/api/plans/plan1/discard')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Keep draft' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm discard' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/plans/plan1/discard' && c.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Draft plan' })).not.toBeInTheDocument());
  });

  test('Add block posts to the plan blocks endpoint', async () => {
    hasDraft = true;
    api({ 'POST /api/plans/plan1/blocks': () => ({ status: 201, body: proposed() }) });
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Add block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add block to draft' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Errand');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add block' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/plans/plan1/blocks' && c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.path === '/api/plans/plan1/blocks')!.body).toMatchObject({ title: 'Errand', category: 'other' });
  });

  test('no plan button for past weeks and no draft lookup', async () => {
    api();
    renderWithProviders(<WeekPage />);
    await screen.findByRole('button', { name: 'Plan this week' });
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Plan / })).not.toBeInTheDocument());
    expect(calls.filter((c) => c.path === '/api/plans/draft')).toHaveLength(1);
  });

  test('ignores a replan-mode draft returned for the week', async () => {
    api({ 'GET /api/plans/draft': () => ({ ...draft, plan: { ...draft.plan, mode: 'replan' } }) });
    renderWithProviders(<WeekPage />);
    await waitFor(() => expect(calls.some((c) => c.path === '/api/plans/draft')).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('button', { name: 'Plan this week' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Draft plan' })).not.toBeInTheDocument();
    expect(screen.queryByText('Draft — review and commit')).not.toBeInTheDocument();
  });

  test('no Plan button while the draft lookup is loading, nor when it failed', async () => {
    api();
    const { unmount } = renderWithProviders(<WeekPage />);
    await screen.findByText('Week');
    expect(screen.queryByRole('button', { name: 'Plan this week' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Plan this week' })).toBeInTheDocument();
    unmount();

    api({ 'GET /api/plans/draft': () => ({ status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }) });
    renderWithProviders(<WeekPage />);
    await waitFor(() => expect(calls.some((c) => c.path === '/api/plans/draft')).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Plan this week' })).not.toBeInTheDocument();
  });

  test('Add block in a next-week draft defaults to that Monday 09:00', async () => {
    hasDraft = true;
    api();
    renderWithProviders(<WeekPage />);
    await goNextWeek();
    await userEvent.click(await screen.findByRole('button', { name: 'Add block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add block to draft' });
    await waitFor(() => expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-19'));
    expect(within(dialog).getByLabelText('Start')).toHaveValue('09:00');
  });

  test('honors ?week= to open that week', async () => {
    api();
    renderWithProviders(<WeekPage />, { route: '/week?week=2026-10-19' });
    expect(await screen.findByText('2026-10-19 – 2026-10-25')).toBeInTheDocument();
  });
});

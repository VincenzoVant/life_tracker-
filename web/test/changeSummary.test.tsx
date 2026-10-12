import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import type { ReplanDraft } from '@life-tracker/shared';
import { describe, expect, test } from 'vitest';
import { ChangeSummary } from '../src/features/replan/ChangeSummary';
import { ReplanPage } from '../src/features/replan/ReplanPage';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const settings = { 'GET /api/settings': () => ({ timezone: 'America/Los_Angeles' }) };

function draftWith(over: Partial<ReplanDraft> = {}, id = 'p1'): ReplanDraft {
  return {
    plan: { id, weekStart: '2026-10-12', mode: 'replan', triggerBlockId: 'b1', status: 'draft', createdAt: '', summary: { shortfalls: [], reservedEvenings: [] } },
    changes: [
      {
        type: 'moved', blockId: 'a', title: 'Study — Econometrics', category: 'study',
        from: { start: '2026-10-21T02:00:00.000Z', end: '2026-10-21T04:00:00.000Z' }, // Tue 19:00 PDT
        to: { start: '2026-10-22T21:00:00.000Z', end: '2026-10-22T23:00:00.000Z' }, // Thu 14:00
      },
      {
        type: 'shortened', blockId: 'b', title: 'Startup', category: 'startup',
        from: { start: '2026-10-21T20:00:00.000Z', end: '2026-10-21T22:00:00.000Z' }, // Wed
        to: { start: '2026-10-21T20:00:00.000Z', end: '2026-10-21T21:30:00.000Z' },
      },
    ],
    shortfalls: [{ kind: 'workout', workoutType: 'gym', missing: 1, unit: 'count' }],
    ...over,
  };
}

describe('ChangeSummary', () => {
  test('shows Moved, Shortened and Can\'t fit lines; hides empty sections', async () => {
    mockApi(settings);
    renderWithProviders(<ChangeSummary draft={draftWith()} />);
    expect(await screen.findByText('Study — Econometrics: Tue 19:00 → Thu 14:00')).toBeInTheDocument();
    expect(screen.getByText('Startup: Wed 2 h → 1.5 h')).toBeInTheDocument();
    expect(screen.getByText("Can't fit: 1 gym session")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Removed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Added' })).not.toBeInTheDocument();
  });
});

function replanPage(route = '/replan/p1') {
  return renderWithProviders(
    <Routes>
      <Route path="/replan/:planId" element={<ReplanPage />} />
      <Route path="/week" element={<p>week page</p>} />
      <Route path="/" element={<p>today page</p>} />
    </Routes>,
    { route },
  );
}

describe('ReplanPage', () => {
  test('apply success navigates to week', async () => {
    mockApi({
      ...settings,
      'GET /api/replan/p1': () => draftWith(),
      'POST /api/replan/p1/apply': () => ({ plan: {}, blocks: [] }),
    });
    replanPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('week page')).toBeInTheDocument();
  });

  test('409 shows the message and Replan again triggers retry onto the new draft', async () => {
    const message = 'Your week changed since this replan — please replan again';
    const { calls } = mockApi({
      ...settings,
      'GET /api/replan/p1': () => draftWith(),
      'GET /api/replan/p2': () => draftWith({ changes: [] }, 'p2'),
      'POST /api/replan/p1/apply': () => ({ status: 409, body: { error: { code: 'CONFLICT', message } } }),
      'POST /api/replan/p1/retry': () => ({ status: 201, body: draftWith({ changes: [] }, 'p2') }),
    });
    replanPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replan again' }));
    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain('GET /api/replan/p2');
  });

  test('Replan again with nothing to move shows "Nothing needs to move"', async () => {
    mockApi({
      ...settings,
      'GET /api/replan/p1': () => draftWith(),
      'POST /api/replan/p1/apply': () => ({ status: 409, body: { error: { code: 'CONFLICT', message: 'stale' } } }),
      'POST /api/replan/p1/retry': () => ({ draft: null }),
    });
    replanPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Replan again' }));
    expect(await screen.findByText('Nothing needs to move')).toBeInTheDocument();
  });

  test('keep as is posts keep and returns to Today', async () => {
    const { calls } = mockApi({
      ...settings,
      'GET /api/replan/p1': () => draftWith(),
      'POST /api/replan/p1/keep': () => ({}),
    });
    replanPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Keep as is' }));
    expect(await screen.findByText('today page')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/replan/p1/keep')).toBe(true);
  });
});

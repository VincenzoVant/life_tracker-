import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREFERENCES, type Block } from '@life-tracker/shared';
import { describe, expect, test } from 'vitest';
import { WeekGrid, handleDragEnd } from '../src/features/week/WeekGrid';
import { useBlockEditing } from '../src/features/week/useBlockEditing';
import { mockApi } from './mockApi';
import { renderWithProviders } from './render';

const tz = 'America/Los_Angeles';
function block(over: Partial<Block>): Block {
  return {
    id: 'b', category: 'other', title: 'Run', start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:00:00.000Z',
    status: 'committed', actualMinutes: null, source: 'manual', locked: false, courseId: null, startupTaskId: null,
    workoutType: null, mealSlot: null, fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null,
    gcalSyncedAt: null, notes: null, createdAt: '', updatedAt: '', ...over,
  };
}
const run = block({ id: 'run' });
const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

function Harness({ blocks }: { blocks: Block[] }) {
  const { onMove, onResize } = useBlockEditing(tz);
  return (
    <>
      <WeekGrid dates={dates} blocks={blocks} prefs={DEFAULT_PREFERENCES} tz={tz} onSelect={() => {}} onMove={onMove} onResize={onResize} />
      <button type="button" onClick={() => handleDragEnd({ active: { id: 'run' }, delta: { x: 0, y: 24 }, over: { id: '2026-10-15' } }, blocks, onMove, tz)}>
        drop
      </button>
    </>
  );
}

describe('drag and resize', () => {
  test('onMove handler sends PATCH with new start/end', async () => {
    const { calls } = mockApi({ 'PATCH /api/blocks/run': () => run });
    renderWithProviders(<Harness blocks={[run]} />);
    // 24px = 30 minutes; Wed 14 -> Thu 15
    fireEvent.click(screen.getByRole('button', { name: 'drop' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      start: '2026-10-15T16:30:00.000Z',
      end: '2026-10-15T17:30:00.000Z',
    });
  });

  test('handleDragEnd ignores locked blocks, drops outside columns and zero moves', () => {
    const moves: unknown[] = [];
    const onMove = (...a: unknown[]) => moves.push(a);
    const ev = (id: string, y: number, over: string | null) => ({ active: { id }, delta: { x: 0, y }, over: over ? { id: over } : null });
    handleDragEnd(ev('lock', 24, '2026-10-14'), [block({ id: 'lock', locked: true })], onMove, tz);
    handleDragEnd(ev('run', 24, null), [run], onMove, tz);
    expect(moves).toEqual([]);
    handleDragEnd(ev('run', 24, '2026-10-14'), [run], onMove, tz);
    expect(moves).toEqual([[run, 30, 0]]);
  });

  test('server 409 on move shows toast and keeps original position', async () => {
    mockApi({ 'PATCH /api/blocks/run': () => ({ status: 409, body: { error: { code: 'CONFLICT', message: 'Overlaps another block' } } }) });
    renderWithProviders(<Harness blocks={[run]} />);
    const card = screen.getByText('Run').closest('button')!;
    const topBefore = card.style.top;
    fireEvent.click(screen.getByRole('button', { name: 'drop' }));
    expect(await screen.findByText('Overlaps another block')).toBeInTheDocument();
    expect(screen.getByText('Run').closest('button')!.style.top).toBe(topBefore);
  });

  test('resize handle only on draggable blocks; resizing sends new end and short results toast', async () => {
    const { calls } = mockApi({ 'PATCH /api/blocks/run': () => run });
    renderWithProviders(<Harness blocks={[run, block({ id: 'lock', locked: true, title: 'Lecture', start: '2026-10-13T16:00:00.000Z', end: '2026-10-13T17:00:00.000Z' })]} />);
    expect(screen.queryByTestId('resize-lock')).not.toBeInTheDocument();
    const handle = screen.getByTestId('resize-run');
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent(window, new MouseEvent('pointerup', { clientY: 148 })); // +48px = 60 min
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls[0]!.body).toEqual({ start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T18:00:00.000Z' });

    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent(window, new MouseEvent('pointerup', { clientY: 52 })); // -60 min → 0 length
    expect(await screen.findByText('Blocks must be at least 15 minutes long')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });
});

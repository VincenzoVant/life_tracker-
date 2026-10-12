import { describe, expect, test } from 'vitest';
import { detectConflicts, dismissConflict, listConflicts, markConflictReplanned } from '../../src/calendar/conflicts.js';
import type { BusyEventRow } from '../../src/calendar/pullBusy.js';
import { createBlock, setBlockStatus } from '../../src/domains/blocks/service.js';
import { createTestCtx } from '../helpers.js';

// Default test clock: 2026-10-14T19:00Z.
type TestCtx = ReturnType<typeof createTestCtx>;

const block = (ctx: TestCtx, hour: number, opts: { locked?: boolean; source?: 'manual' | 'fixed' | 'unplanned' } = {}) =>
  createBlock(
    ctx,
    { category: 'study', title: `b${hour}`, start: `2026-10-15T${hour}:00:00.000Z`, end: `2026-10-15T${hour}:59:00.000Z` },
    { ...opts },
  );
const ev = (start: string, end: string, over: Partial<BusyEventRow> = {}): BusyEventRow => ({
  calendarId: 'primary',
  eventId: 'e1',
  title: 'Dentist',
  start,
  end,
  updated: '2026-10-14T19:00:00.000Z',
  ...over,
});
const E10 = ev('2026-10-15T10:30:00.000Z', '2026-10-15T11:30:00.000Z');

describe('detectConflicts', () => {
  test('new external event overlapping a committed study block opens a conflict listing that block', () => {
    const ctx = createTestCtx();
    const b = block(ctx, 10);
    block(ctx, 14);
    expect(detectConflicts(ctx, { changed: [E10], removed: [] })).toEqual({ opened: 1, resolved: 0 });
    const open = listConflicts(ctx, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ calendarId: 'primary', externalEventId: 'e1', title: 'Dentist', status: 'open' });
    expect(open[0]!.blocks.map((x) => x.id)).toEqual([b.id]);
  });

  test('overlap with locked fixed block, reviewed block, past block or unplanned block does not conflict', () => {
    const ctx = createTestCtx();
    block(ctx, 10, { locked: true, source: 'fixed' });
    const done = block(ctx, 10);
    setBlockStatus(ctx, done.id, 'done');
    block(ctx, 10, { source: 'unplanned' });
    expect(detectConflicts(ctx, { changed: [E10], removed: [] })).toEqual({ opened: 0, resolved: 0 });
    expect(listConflicts(ctx, 'open')).toEqual([]);
    const past = ev('2026-10-14T10:00:00.000Z', '2026-10-14T18:00:00.000Z');
    createBlock(ctx, { category: 'study', title: 'past', start: '2026-10-14T17:00:00.000Z', end: '2026-10-14T18:00:00.000Z' });
    expect(detectConflicts(ctx, { changed: [past], removed: [] }).opened).toBe(0);
  });

  test('same event changed again updates the existing open conflict (no duplicate)', () => {
    const ctx = createTestCtx();
    const a = block(ctx, 10);
    const b = block(ctx, 12);
    detectConflicts(ctx, { changed: [E10], removed: [] });
    const longer = ev('2026-10-15T10:30:00.000Z', '2026-10-15T12:30:00.000Z', { title: 'Dentist (long)' });
    expect(detectConflicts(ctx, { changed: [longer], removed: [] })).toEqual({ opened: 0, resolved: 0 });
    const open = listConflicts(ctx, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ title: 'Dentist (long)', end: longer.end });
    expect(open[0]!.blocks.map((x) => x.id)).toEqual([a.id, b.id]);
  });

  test('event moved away from the block auto-dismisses the conflict', () => {
    const ctx = createTestCtx();
    block(ctx, 10);
    detectConflicts(ctx, { changed: [E10], removed: [] });
    const moved = ev('2026-10-16T10:30:00.000Z', '2026-10-16T11:30:00.000Z');
    expect(detectConflicts(ctx, { changed: [moved], removed: [] })).toEqual({ opened: 0, resolved: 1 });
    expect(listConflicts(ctx, 'open')).toEqual([]);
  });

  test('removed event dismisses its open conflict', () => {
    const ctx = createTestCtx();
    block(ctx, 10);
    detectConflicts(ctx, { changed: [E10], removed: [] });
    expect(detectConflicts(ctx, { changed: [], removed: [E10] })).toEqual({ opened: 0, resolved: 1 });
    expect(listConflicts(ctx, 'open')).toEqual([]);
  });

  test('dismissed conflict stays dismissed unless the event changes again to overlap', () => {
    const ctx = createTestCtx();
    block(ctx, 10);
    detectConflicts(ctx, { changed: [E10], removed: [] });
    const id = listConflicts(ctx, 'open')[0]!.id;
    expect(dismissConflict(ctx, id).status).toBe('dismissed');
    expect(listConflicts(ctx, 'open')).toEqual([]);
    // unrelated pull with nothing changed leaves it dismissed
    expect(detectConflicts(ctx, { changed: [], removed: [] })).toEqual({ opened: 0, resolved: 0 });
    expect(listConflicts(ctx, 'open')).toEqual([]);
    // only a re-stamped `updated` (no start/end/title change) leaves it dismissed
    expect(detectConflicts(ctx, { changed: [{ ...E10, updated: '2026-10-14T20:00:00.000Z' }], removed: [] }).opened).toBe(0);
    expect(listConflicts(ctx, 'open')).toEqual([]);
    // the event is moved and still overlaps: reopened
    expect(detectConflicts(ctx, { changed: [{ ...E10, end: '2026-10-15T11:45:00.000Z', updated: '2026-10-14T20:30:00.000Z' }], removed: [] }).opened).toBe(1);
    expect(listConflicts(ctx, 'open').map((c) => c.id)).toEqual([id]);
  });

  test('markConflictReplanned leaves the open list; unknown id is NOT_FOUND', () => {
    const ctx = createTestCtx();
    block(ctx, 10);
    detectConflicts(ctx, { changed: [E10], removed: [] });
    const id = listConflicts(ctx, 'open')[0]!.id;
    expect(markConflictReplanned(ctx, id).status).toBe('replanned');
    expect(listConflicts(ctx, 'open')).toEqual([]);
    expect(() => dismissConflict(ctx, 999)).toThrow('Conflict not found');
  });
});

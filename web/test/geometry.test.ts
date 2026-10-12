import { DEFAULT_PREFERENCES, type Block } from '@life-tracker/shared';
import { describe, expect, test } from 'vitest';
import { applyMove, applyResize, blockHeight, blockTop, canDrag, extendGridHours, gridHours, layoutOverlaps, minutesFromPixels } from '../src/features/week/geometry';

const tz = 'America/Los_Angeles';
const b = (id: string, start: string, end: string) => ({ id, start, end }) as Block;

describe('week geometry', () => {
  test('gridHours pads one hour around default earliest/latest', () => {
    expect(gridHours(DEFAULT_PREFERENCES)).toEqual({ from: 7, to: 24 });
    expect(gridHours({ earliestBlock: '00:30', latestBlockEnd: '12:00' })).toEqual({ from: 0, to: 13 });
  });

  test('12:30 block top at (12.5-7)*48 with default prefs; 90 min height 72', () => {
    const block = b('x', '2026-10-14T19:30:00.000Z', '2026-10-14T21:00:00.000Z'); // 12:30-14:00 PDT
    expect(blockTop(block, '2026-10-14', tz, gridHours(DEFAULT_PREFERENCES))).toBe((12.5 - 7) * 48);
    expect(blockHeight(block)).toBe(72);
  });

  test('blockTop uses wall-clock hours on DST days', () => {
    const hours = gridHours(DEFAULT_PREFERENCES);
    const fall = b('f', '2026-11-01T20:30:00.000Z', '2026-11-01T21:30:00.000Z'); // 12:30 PST
    const spring = b('s', '2027-03-14T19:30:00.000Z', '2027-03-14T20:30:00.000Z'); // 12:30 PDT
    expect(blockTop(fall, '2026-11-01', tz, hours)).toBe((12.5 - 7) * 48);
    expect(blockTop(spring, '2027-03-14', tz, hours)).toBe((12.5 - 7) * 48);
    expect(blockHeight(fall)).toBe(48);
  });

  test('extendGridHours widens the range to include blocks outside the preference window', () => {
    const hours = { from: 7, to: 24 };
    const early = b('e', '2026-10-14T12:00:00.000Z', '2026-10-14T13:00:00.000Z'); // 05:00-06:00 PDT
    expect(extendGridHours(hours, [early], tz)).toEqual({ from: 5, to: 24 });
    const overnight = b('o', '2026-10-15T05:00:00.000Z', '2026-10-15T08:00:00.000Z'); // 22:00-01:00 PDT
    expect(extendGridHours({ from: 7, to: 23 }, [overnight], tz)).toEqual({ from: 7, to: 24 });
    expect(extendGridHours(hours, [], tz)).toEqual(hours);
  });

  test('minutesFromPixels snaps to 15', () => {
    expect(minutesFromPixels(20)).toBe(30);
    expect(minutesFromPixels(12)).toBe(15);
    expect(minutesFromPixels(-48)).toBe(-60);
  });

  test('layoutOverlaps gives two columns for overlapping blocks', () => {
    const m = layoutOverlaps([
      b('a', '2026-10-14T16:00:00.000Z', '2026-10-14T18:00:00.000Z'),
      b('c', '2026-10-14T17:00:00.000Z', '2026-10-14T19:00:00.000Z'),
      b('d', '2026-10-14T20:00:00.000Z', '2026-10-14T21:00:00.000Z'),
    ]);
    expect(m.get('a')).toEqual({ col: 0, cols: 2 });
    expect(m.get('c')).toEqual({ col: 1, cols: 2 });
    expect(m.get('d')).toEqual({ col: 0, cols: 1 });
  });
});

describe('move/resize rules', () => {
  const blk = (over: Partial<Block> = {}) =>
    ({ id: 'x', start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T17:30:00.000Z', status: 'committed', locked: false, ...over }) as Block;

  test('applyMove +30 min and +1 day keeps duration', () => {
    expect(applyMove(blk(), 30, 1)).toEqual({ start: '2026-10-15T16:30:00.000Z', end: '2026-10-15T18:00:00.000Z' });
  });

  test('applyMove with tz keeps local clock time across a DST change', () => {
    // Sat 2026-10-31 10:00 PDT -> Sun Nov 1 10:00 PST = 18:00Z
    const r = applyMove(blk({ start: '2026-10-31T17:00:00.000Z', end: '2026-10-31T18:00:00.000Z' }), 0, 1, 'America/Los_Angeles');
    expect(r).toEqual({ start: '2026-11-01T18:00:00.000Z', end: '2026-11-01T19:00:00.000Z' });
  });

  test('applyResize changes only the end; below 15 min → null', () => {
    expect(applyResize(blk(), 30)).toEqual({ start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T18:00:00.000Z' });
    expect(applyResize(blk(), -75)).toEqual({ start: '2026-10-14T16:00:00.000Z', end: '2026-10-14T16:15:00.000Z' });
    expect(applyResize(blk(), -90)).toBeNull();
    expect(applyResize(blk(), -80)).toBeNull();
  });

  test('canDrag false for locked, done, removed', () => {
    expect(canDrag(blk())).toBe(true);
    expect(canDrag(blk({ status: 'proposed' }))).toBe(true);
    expect(canDrag(blk({ locked: true }))).toBe(false);
    expect(canDrag(blk({ status: 'done' }))).toBe(false);
    expect(canDrag(blk({ status: 'removed' }))).toBe(false);
  });
});

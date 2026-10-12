import { DEFAULT_PREFERENCES, type Block } from '@life-tracker/shared';
import { describe, expect, test } from 'vitest';
import { blockHeight, blockTop, gridHours, layoutOverlaps, minutesFromPixels } from '../src/features/week/geometry';

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

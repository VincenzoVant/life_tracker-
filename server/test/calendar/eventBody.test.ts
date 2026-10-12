import { describe, expect, test } from 'vitest';
import type { Block } from '@life-tracker/shared';
import { deriveOp, eventHash, shouldMirror, toGoogleEvent } from '../../src/calendar/eventBody.js';

const base: Block = {
  id: 'B1', category: 'study', title: 'Read ch. 3', start: '2026-10-15T17:00:00.000Z', end: '2026-10-15T18:00:00.000Z',
  status: 'committed', actualMinutes: null, source: 'planner', locked: false, courseId: null, startupTaskId: null,
  workoutType: null, mealSlot: null, fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null,
  gcalSyncedAt: null, notes: null, createdAt: 'x', updatedAt: 'x',
};
const opts = { tz: 'America/Los_Angeles', appOrigin: 'http://127.0.0.1:4280' };

describe('eventBody', () => {
  test('toGoogleEvent maps title, times with tz, color, description link and private block id', () => {
    expect(toGoogleEvent(base, opts)).toEqual({
      summary: 'Read ch. 3',
      description: 'Life Tracker · http://127.0.0.1:4280/week?block=B1',
      colorId: '9',
      start: { dateTime: base.start, timeZone: 'America/Los_Angeles' },
      end: { dateTime: base.end, timeZone: 'America/Los_Angeles' },
      extendedProperties: { private: { lifeTrackerBlockId: 'B1' } },
    });
  });

  test('eventHash identical for status-only change (committed → done)', () => {
    const a = eventHash(toGoogleEvent(base, opts));
    expect(eventHash(toGoogleEvent({ ...base, status: 'done', actualMinutes: 60 }, opts))).toBe(a);
    expect(eventHash(toGoogleEvent({ ...base, title: 'Other' }, opts))).not.toBe(a);
  });

  test('mirroring rule and deriveOp', () => {
    expect(shouldMirror({ ...base, status: 'proposed' })).toBe(false);
    expect(shouldMirror({ ...base, source: 'unplanned', status: 'done' })).toBe(false);
    expect(shouldMirror({ ...base, status: 'skipped' })).toBe(true);
    expect(deriveOp(base)).toBe('create');
    expect(deriveOp({ ...base, gcalEventId: 'e' })).toBe('update');
    expect(deriveOp({ ...base, status: 'removed', gcalEventId: 'e' })).toBe('delete');
    expect(deriveOp({ ...base, status: 'removed' })).toBeNull();
    expect(deriveOp({ ...base, status: 'proposed' })).toBeNull();
  });
});

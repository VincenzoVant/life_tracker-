import type { Block } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { overlapWarnings } from '../src/features/week/overlaps';

function block(id: string, from: string, to: string, over: Partial<Block> = {}): Block {
  return {
    id, category: 'study', title: id, start: `2026-10-14T${from}:00.000Z`, end: `2026-10-14T${to}:00.000Z`,
    status: 'committed', actualMinutes: null, source: 'manual', locked: false, courseId: null, startupTaskId: null,
    workoutType: null, mealSlot: null, fixedEventId: null, planId: null, gcalEventId: null, gcalEtag: null,
    gcalSyncedAt: null, notes: null, createdAt: '', updatedAt: '', ...over,
  };
}

test('overlapWarnings flags quick-add over locked class and the class', () => {
  const cls = block('class', '16:00', '18:00', { source: 'fixed', locked: true });
  const drinks = block('drinks', '17:00', '19:00', { source: 'quick_add', category: 'social', locked: true });
  const later = block('later', '20:00', '21:00');
  expect(overlapWarnings([cls, drinks, later])).toEqual(new Set(['class', 'drinks']));
});

test('touching blocks are not overlaps', () => {
  expect(overlapWarnings([block('a', '16:00', '17:00'), block('b', '17:00', '18:00')])).toEqual(new Set());
});

test('removed and proposed blocks are ignored; two meals do not count', () => {
  const a = block('a', '16:00', '18:00');
  expect(overlapWarnings([a, block('gone', '16:30', '17:30', { status: 'removed' }), block('p', '16:30', '17:30', { status: 'proposed' })])).toEqual(
    new Set(),
  );
  expect(
    overlapWarnings([block('m1', '16:00', '17:00', { category: 'meal' }), block('m2', '16:30', '17:30', { category: 'meal' })]),
  ).toEqual(new Set());
  expect(overlapWarnings([block('m1', '16:00', '17:00', { category: 'meal' }), block('s', '16:30', '17:30')])).toEqual(new Set(['m1', 's']));
});

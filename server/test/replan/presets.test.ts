import { DEFAULT_PREFERENCES, QuickAddInput, localDateOf, localTimeOf, type Preferences } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { resolveQuickAddWhen } from '../../src/domains/replan/presets.js';
import { AppError } from '../../src/lib/errors.js';

const TZ = 'America/Los_Angeles';
const PREFS = DEFAULT_PREFERENCES as Preferences;
const local = (d: Date) => localTimeOf(d, TZ);

function failure(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a throw');
}

test('rest_of_tonight at Wed 19:07 local → 19:15 .. 23:30', () => {
  const r = resolveQuickAddWhen({ preset: 'rest_of_tonight' }, new Date('2026-10-15T02:07:00Z'), PREFS, TZ);
  expect(local(r.start)).toBe('19:15');
  expect(local(r.end)).toBe('23:30');
});

test('rest_of_tonight with bedtime 00:30 at 23:00 ends next day 00:30', () => {
  const prefs = { ...PREFS, sleep: { start: '00:30', end: '07:30' } };
  const now = new Date('2026-10-15T06:00:00Z'); // Wed 23:00 PDT
  const r = resolveQuickAddWhen({ preset: 'rest_of_tonight' }, now, prefs, TZ);
  expect(local(r.start)).toBe('23:00');
  expect(local(r.end)).toBe('00:30');
  expect(localDateOf(r.end, TZ)).toBe('2026-10-15');
});

test('rest_of_tonight at 23:40 with bedtime 23:30 → VALIDATION fields.when', () => {
  const e = failure(() => resolveQuickAddWhen({ preset: 'rest_of_tonight' }, new Date('2026-10-15T06:40:00Z'), PREFS, TZ));
  expect(e.code).toBe('VALIDATION');
  expect(e.status).toBe(400);
  expect(e.fields).toEqual({ when: "It's already past your bedtime" });
});

test('this_afternoon at 10:00 → 12:00..18:00', () => {
  const r = resolveQuickAddWhen({ preset: 'this_afternoon' }, new Date('2026-10-15T17:00:00Z'), PREFS, TZ);
  expect(local(r.start)).toBe('12:00');
  expect(local(r.end)).toBe('18:00');
});

test('this_afternoon at 14:10 starts at 14:15', () => {
  const r = resolveQuickAddWhen({ preset: 'this_afternoon' }, new Date('2026-10-15T21:10:00Z'), PREFS, TZ);
  expect(local(r.start)).toBe('14:15');
});

test('this_afternoon at 18:30 → "The afternoon is over"', () => {
  const e = failure(() => resolveQuickAddWhen({ preset: 'this_afternoon' }, new Date('2026-10-16T01:30:00Z'), PREFS, TZ));
  expect(e.code).toBe('VALIDATION');
  expect(e.fields).toEqual({ when: 'The afternoon is over' });
});

test('all_day at 06:00 → 08:00..23:30', () => {
  const r = resolveQuickAddWhen({ preset: 'all_day' }, new Date('2026-10-15T13:00:00Z'), PREFS, TZ);
  expect(local(r.start)).toBe('08:00');
  expect(local(r.end)).toBe('23:30');
});

test('all_day after bedtime → past bedtime message', () => {
  const e = failure(() => resolveQuickAddWhen({ preset: 'all_day' }, new Date('2026-10-15T06:40:00Z'), PREFS, TZ));
  expect(e.fields).toEqual({ when: "It's already past your bedtime" });
});

test('custom start + duration passes through', () => {
  const r = resolveQuickAddWhen(
    { start: '2026-10-16T02:00:00.000Z', durationMinutes: 90 },
    new Date('2026-10-15T00:00:00Z'), PREFS, TZ,
  );
  expect(r.start.toISOString()).toBe('2026-10-16T02:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-10-16T03:30:00.000Z');
});

test('QuickAddInput defaults category to social and rejects a 10-minute duration', () => {
  const ok = QuickAddInput.parse({ title: 'Drinks', when: { preset: 'all_day' } });
  expect(ok.category).toBe('social');
  const bad = QuickAddInput.safeParse({ title: 'x', when: { start: '2026-10-16T02:00:00.000Z', durationMinutes: 10 } });
  expect(bad.success).toBe(false);
  expect(QuickAddInput.safeParse({ title: '', when: { preset: 'all_day' } }).success).toBe(false);
});

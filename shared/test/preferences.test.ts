import { expect, test } from 'vitest';
import {
  DEFAULT_PREFERENCES, PreferencesSchema, dayBoundsUtc, eveningWindowUtc, localTimeOf, sleepStartUtc,
} from '../src/index.js';

const TZ = 'America/Los_Angeles';

function fieldsOf(input: unknown): Record<string, string> {
  const r = PreferencesSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[i.path.join('.')] ??= i.message;
  return out;
}

test('empty object parses to defaults', () => {
  expect(PreferencesSchema.parse({})).toEqual(DEFAULT_PREFERENCES);
  expect(DEFAULT_PREFERENCES.studyBlock).toEqual({ min: 45, max: 120 });
  expect(DEFAULT_PREFERENCES.preferredStartupWindows).toHaveLength(2);
  expect(DEFAULT_PREFERENCES.classesCountTowardStudy).toBe(false);
  expect(DEFAULT_PREFERENCES.weightUnit).toBe('kg');
  expect(PreferencesSchema.parse({ weightUnit: 'lbs' }).weightUnit).toBe('lbs');
  expect(fieldsOf({ weightUnit: 'stone' })).toHaveProperty('weightUnit');
});
test('earliestBlock >= latestBlockEnd rejected at earliestBlock', () => {
  expect(Object.keys(fieldsOf({ earliestBlock: '22:30', latestBlockEnd: '22:30' }))).toContain('earliestBlock');
  expect(Object.keys(fieldsOf({ earliestBlock: '23:00', latestBlockEnd: '22:30' }))).toContain('earliestBlock');
});
test('studyBlock min > max rejected; min not multiple of 15 rejected', () => {
  expect(fieldsOf({ studyBlock: { min: 120, max: 60 } })).toHaveProperty('studyBlock.min');
  expect(fieldsOf({ studyBlock: { min: 50, max: 120 } })).toHaveProperty('studyBlock.min');
  expect(fieldsOf({ startupBlock: { min: 180, max: 60 } })).toHaveProperty('startupBlock.min');
  expect(fieldsOf({ startupBlock: { min: 60, max: 100 } })).toHaveProperty('startupBlock.max');
});
test('TimeWindow start must be before end', () => {
  const f = fieldsOf({ preferredWorkoutWindows: [{ days: [1], start: '19:00', end: '17:00' }] });
  expect(f).toHaveProperty('preferredWorkoutWindows.0.start');
});
test('usable day under 60 minutes rejected at latestBlockEnd', () => {
  const r = PreferencesSchema.safeParse({ earliestBlock: '22:00', latestBlockEnd: '22:30' });
  expect(r.success).toBe(false);
  expect(fieldsOf({ earliestBlock: '22:00', latestBlockEnd: '22:30' }).latestBlockEnd).toBe(
    'Preferences leave less than an hour per day',
  );
});
test('bedtime after midnight: sleep.start 00:30 belongs to next date', () => {
  const p = PreferencesSchema.parse({ sleep: { start: '00:30', end: '08:00' }, latestBlockEnd: '23:30' });
  expect(sleepStartUtc('2026-10-14', p, TZ).toISOString()).toBe('2026-10-15T07:30:00.000Z');
  expect(localTimeOf(dayBoundsUtc('2026-10-14', p, TZ).end, TZ)).toBe('23:30');
  expect(eveningWindowUtc('2026-10-14', p, TZ).end.toISOString()).toBe('2026-10-15T07:30:00.000Z');
});
test('default day bounds are 08:00-22:30 and evening 19:00-23:30', () => {
  const b = dayBoundsUtc('2026-10-14', DEFAULT_PREFERENCES, TZ);
  expect([localTimeOf(b.start, TZ), localTimeOf(b.end, TZ)]).toEqual(['08:00', '22:30']);
  const e = eveningWindowUtc('2026-10-14', DEFAULT_PREFERENCES, TZ);
  expect([localTimeOf(e.start, TZ), localTimeOf(e.end, TZ)]).toEqual(['19:00', '23:30']);
});
test('protectedEvenings are ISO weekdays', () => {
  expect(PreferencesSchema.parse({ protectedEvenings: [5] }).protectedEvenings).toEqual([5]);
  expect(fieldsOf({ protectedEvenings: [8] })).toHaveProperty('protectedEvenings.0');
});

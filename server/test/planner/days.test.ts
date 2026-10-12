import { DEFAULT_PREFERENCES, localTimeOf, weekRangeUtc } from '@life-tracker/shared';
import { expect, test } from 'vitest';
import { buildDayWindows, localWindow } from '../../src/planner/days.js';
import { NEXT_WEEK, TZ, at, prefs } from './fixtures.js';

test('day windows are 08:00-22:30 local for each of 7 days', () => {
  const w = buildDayWindows(NEXT_WEEK, TZ, DEFAULT_PREFERENCES);
  expect(w).toHaveLength(7);
  expect(w[0]).toEqual({ date: '2026-10-19', start: at('2026-10-19', '08:00'), end: at('2026-10-19', '22:30') });
});
test('day windows across DST fall-back keep local times', () => {
  const r = weekRangeUtc('2026-10-26', TZ);
  const w = buildDayWindows({ start: r.start.getTime(), end: r.end.getTime() }, TZ, DEFAULT_PREFERENCES);
  expect(localTimeOf(new Date(w[6]!.start), TZ)).toBe('08:00'); // Sun 2026-11-01
  expect(localTimeOf(new Date(w[6]!.end), TZ)).toBe('22:30');
});
test('windows are clipped to the range and empty ones dropped', () => {
  const w = buildDayWindows({ start: at('2026-10-21', '12:15'), end: at('2026-10-23', '09:00') }, TZ, DEFAULT_PREFERENCES);
  expect(w.map((x) => x.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  expect(w[0]!.start).toBe(at('2026-10-21', '12:15'));
  expect(w[2]!.end).toBe(at('2026-10-23', '09:00'));
  const late = buildDayWindows({ start: at('2026-10-21', '23:00'), end: at('2026-10-22', '07:00') }, TZ, DEFAULT_PREFERENCES);
  expect(late).toEqual([]);
});
test('after-midnight bedtime never extends the window past latestBlockEnd', () => {
  const p = prefs({ sleep: { start: '00:30', end: '08:00' }, latestBlockEnd: '23:30' });
  const w = buildDayWindows(NEXT_WEEK, TZ, p);
  expect(w[0]!.end).toBe(at('2026-10-19', '23:30'));
});
test('localWindow converts HH:mm to an interval', () => {
  expect(localWindow('2026-10-19', { start: '17:00', end: '19:00' }, TZ)).toEqual({
    start: at('2026-10-19', '17:00'), end: at('2026-10-19', '19:00'),
  });
});

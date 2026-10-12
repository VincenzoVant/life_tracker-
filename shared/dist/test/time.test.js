import { expect, test } from 'vitest';
import { addDays, dayRangeUtc, isoWeekday, localDateOf, minutesBetween, weekDates, weekRangeUtc, weekStartOf, zonedToUtc, } from '../src/index.js';
const TZ = 'America/Los_Angeles';
test('localDateOf uses the timezone, not UTC', () => {
    expect(localDateOf(new Date('2026-10-15T05:30:00Z'), TZ)).toBe('2026-10-14');
});
test('weekStartOf returns Monday local date', () => {
    expect(weekStartOf(new Date('2026-10-14T19:00:00Z'), TZ)).toBe('2026-10-12');
    expect(weekStartOf(new Date('2026-10-19T06:59:00Z'), TZ)).toBe('2026-10-12'); // Sun 23:59 local
});
test('zonedToUtc converts local wall time', () => {
    expect(zonedToUtc('2026-10-14', '19:00', TZ).toISOString()).toBe('2026-10-15T02:00:00.000Z');
});
test('dayRangeUtc spans 25h on DST fall-back day', () => {
    const { start, end } = dayRangeUtc('2026-11-01', TZ);
    expect(minutesBetween(start, end)).toBe(25 * 60);
});
test('weekRangeUtc and weekDates', () => {
    const r = weekRangeUtc('2026-10-12', TZ);
    expect(r.start.toISOString()).toBe('2026-10-12T07:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-19T07:00:00.000Z');
    expect(weekDates('2026-10-12')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
});
test('isoWeekday and addDays', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
});

import { expect, test } from 'vitest';
import { FixedEventInput, LocalDate, MilestoneInput, ReviewQuery, WeekProgressQuery } from '../src/index.js';

test('LocalDate accepts real dates and rejects impossible ones', () => {
  expect(LocalDate.safeParse('2026-02-28').success).toBe(true);
  expect(LocalDate.safeParse('2028-02-29').success).toBe(true);
  for (const bad of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-1-1', 'x']) {
    expect(LocalDate.safeParse(bad).success, bad).toBe(false);
  }
});

test('schemas using dates reject impossible dates', () => {
  expect(ReviewQuery.safeParse({ date: '2026-13-45' }).success).toBe(false);
  expect(WeekProgressQuery.safeParse({ weekStart: '2026-13-45' }).success).toBe(false);
  expect(MilestoneInput.safeParse({ title: 'x', targetDate: '2026-02-30' }).success).toBe(false);
  expect(
    FixedEventInput.safeParse({
      title: 'x', kind: 'work', weekday: 1, startTime: '10:00', endTime: '11:00', validFrom: '2026-13-45', validTo: '2026-12-31',
    }).success,
  ).toBe(false);
});

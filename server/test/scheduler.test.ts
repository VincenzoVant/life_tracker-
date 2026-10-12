import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createScheduler } from '../src/jobs/scheduler.js';

// Fake timers also fake Date, so this clock follows the advancing fake time.
const clock = { now: () => new Date() };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('every runs repeatedly and survives a throwing job', async () => {
  const log = vi.fn();
  const s = createScheduler({ clock, log });
  const fn = vi.fn(() => {
    throw new Error('boom');
  });
  s.every('j', 1000, fn);
  await vi.advanceTimersByTimeAsync(3000);
  expect(fn).toHaveBeenCalledTimes(3);
  expect(log).toHaveBeenCalledTimes(3);
  s.stop();
});

test('dailyAt fires at next local 00:05 and then daily', async () => {
  // 2026-10-12 23:50 in Los Angeles (PDT, UTC-7) = 2026-10-13T06:50Z
  vi.setSystemTime(new Date('2026-10-13T06:50:00Z'));
  const s = createScheduler({ clock });
  const fn = vi.fn();
  s.dailyAt('d', '00:05', () => 'America/Los_Angeles', fn);
  await vi.advanceTimersByTimeAsync(14 * 60_000);
  expect(fn).toHaveBeenCalledTimes(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(new Date().toISOString()).toBe('2026-10-13T07:05:00.000Z');
  await vi.advanceTimersByTimeAsync(24 * 3_600_000);
  expect(fn).toHaveBeenCalledTimes(2);
  s.stop();
});

test('a running async job is not started twice', async () => {
  const s = createScheduler({ clock });
  let release!: () => void;
  const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
  s.every('slow', 1000, fn);
  await vi.advanceTimersByTimeAsync(3500);
  expect(fn).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fn).toHaveBeenCalledTimes(2);
  release();
  s.stop();
});

test('stop cancels timers', async () => {
  const s = createScheduler({ clock });
  const fn = vi.fn();
  s.every('j', 1000, fn);
  s.stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(fn).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test('runNow runs a registered job and rejects unknown names', async () => {
  const s = createScheduler({ clock });
  const fn = vi.fn();
  s.every('j', 60_000, fn);
  await s.runNow('j');
  expect(fn).toHaveBeenCalledTimes(1);
  await expect(s.runNow('nope')).rejects.toThrow('unknown job');
  s.stop();
});

test('duplicate job names throw', () => {
  const s = createScheduler({ clock });
  s.every('j', 1000, vi.fn());
  expect(() => s.every('j', 1000, vi.fn())).toThrow('duplicate job');
  expect(() => s.dailyAt('j', '03:00', () => 'UTC', vi.fn())).toThrow('duplicate job');
  s.stop();
});

test.each([0, -5, Number.NaN, Infinity, 2 ** 31])('every rejects invalid interval %s', (ms) => {
  const s = createScheduler({ clock });
  expect(() => s.every('j', ms, vi.fn())).toThrow('invalid interval');
  expect(vi.getTimerCount()).toBe(0);
});

test('every accepts the max timer interval', () => {
  const s = createScheduler({ clock });
  expect(() => s.every('j', 2 ** 31 - 1, vi.fn())).not.toThrow();
  s.stop();
});

test.each(['3:00', '24:00', '12:60', '0300', 'ab:cd', '03:00:00', ''])('dailyAt rejects invalid time %j', (t) => {
  const s = createScheduler({ clock });
  expect(() => s.dailyAt('d', t, () => 'UTC', vi.fn())).toThrow('invalid time');
  expect(vi.getTimerCount()).toBe(0);
});

test('dailyAt accepts boundary times', () => {
  const s = createScheduler({ clock });
  expect(() => s.dailyAt('a', '00:00', () => 'UTC', vi.fn())).not.toThrow();
  expect(() => s.dailyAt('b', '23:59', () => 'UTC', vi.fn())).not.toThrow();
  s.stop();
});

test('an early-firing timer does not re-run the same dailyAt occurrence', async () => {
  vi.setSystemTime(new Date('2026-10-12T02:59:00Z'));
  // First read (registration) is accurate; afterwards the clock lags 200ms, so the timer fires "early" by the clock.
  let reads = 0;
  const lagging = { now: () => new Date(Date.now() - (reads++ === 0 ? 0 : 200)) };
  const s = createScheduler({ clock: lagging });
  const fn = vi.fn();
  s.dailyAt('d', '03:00', () => 'UTC', fn);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(fn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(24 * 3_600_000);
  expect(fn).toHaveBeenCalledTimes(2);
  s.stop();
});

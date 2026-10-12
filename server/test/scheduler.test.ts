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

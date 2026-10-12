import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { installShutdownHandlers } from '../src/shutdown.js';

function setup() {
  const order: string[] = [];
  const proc = new EventEmitter();
  const scheduler = { stop: vi.fn(() => void order.push('stop')) };
  const log = {
    info: vi.fn(() => void order.push('info')),
    fatal: vi.fn(() => void order.push('fatal')),
    flush: vi.fn((cb?: () => void) => {
      order.push('flush');
      cb?.();
    }),
  };
  const exit = vi.fn((code: number) => void order.push(`exit${code}`));
  installShutdownHandlers({ scheduler, log: log as any, exit, proc });
  return { order, proc, scheduler, log, exit };
}

test.each(['SIGINT', 'SIGTERM'])('%s stops scheduler, logs, flushes, exits 0 once', (sig) => {
  const { order, proc, exit } = setup();
  proc.emit(sig);
  proc.emit(sig);
  expect(order).toEqual(['stop', 'info', 'flush', 'exit0']);
  expect(exit).toHaveBeenCalledTimes(1);
});

test.each(['uncaughtException', 'unhandledRejection'])('%s logs fatal, flushes, exits 1', (kind) => {
  const { order, proc, log } = setup();
  proc.emit(kind, new Error('x'));
  expect(order).toEqual(['fatal', 'flush', 'exit1']);
  expect(log.fatal).toHaveBeenCalledWith({ err: expect.any(Error) }, kind);
});

test('exits after 1s if flush never calls back', () => {
  vi.useFakeTimers();
  const proc = new EventEmitter();
  const exit = vi.fn();
  const log = { info: vi.fn(), fatal: vi.fn(), flush: vi.fn() };
  installShutdownHandlers({ scheduler: { stop: vi.fn() }, log: log as any, exit, proc });
  proc.emit('SIGTERM');
  expect(exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(exit).toHaveBeenCalledWith(0);
  vi.useRealTimers();
});

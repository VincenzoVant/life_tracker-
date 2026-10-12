import type { Logger } from 'pino';

interface ProcessLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface ShutdownOpts {
  scheduler: { stop(): void };
  log: Pick<Logger, 'info' | 'fatal' | 'flush'>;
  exit?: (code: number) => void;
  /** Event source for signals/errors; defaults to the real process. */
  proc?: ProcessLike;
}

/** Flush the logger (bounded to 1s), then exit. */
export function flushThenExit(
  log: Pick<Logger, 'flush'>,
  code: number,
  exit: (code: number) => void = (c) => process.exit(c),
): void {
  const timer = setTimeout(() => exit(code), 1000);
  log.flush(() => {
    clearTimeout(timer);
    exit(code);
  });
}

/** Single shutdown path: signals stop the scheduler, log, flush, exit 0; fatal errors log, flush, exit 1. */
export function installShutdownHandlers(opts: ShutdownOpts): void {
  const { scheduler, log } = opts;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const proc = opts.proc ?? process;
  let shuttingDown = false;

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    proc.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      scheduler.stop();
      log.info({ sig }, 'shutting down');
      flushThenExit(log, 0, exit);
    });
  }
  const fatal = (kind: string) => (err: unknown) => {
    log.fatal({ err }, kind);
    flushThenExit(log, 1, exit);
  };
  proc.on('uncaughtException', fatal('uncaughtException'));
  proc.on('unhandledRejection', fatal('unhandledRejection'));
}

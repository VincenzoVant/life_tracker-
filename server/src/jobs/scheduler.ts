import { addDays, localDateOf, zonedToUtc } from '@life-tracker/shared';
import type { Clock } from '../lib/clock.js';

type JobFn = () => void | Promise<void>;

export interface Scheduler {
  every(name: string, ms: number, fn: JobFn): void;
  dailyAt(name: string, time: string, tz: () => string, fn: JobFn): void;
  runNow(name: string): Promise<void>;
  stop(): void;
}

interface Job {
  fn: JobFn;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** Next instant strictly after `now` at which the local clock in `tz` reads `time`. */
function nextDailyOccurrence(now: Date, time: string, tz: string): Date {
  const today = localDateOf(now, tz);
  const candidate = zonedToUtc(today, time, tz);
  return candidate.getTime() > now.getTime() ? candidate : zonedToUtc(addDays(today, 1), time, tz);
}

export function createScheduler(opts: { clock: Clock; log?: (msg: string, err?: unknown) => void }): Scheduler {
  const log = opts.log ?? ((msg: string, err?: unknown) => console.error(msg, err));
  const jobs = new Map<string, Job>();
  let stopped = false;

  async function run(name: string, job: Job): Promise<void> {
    if (job.running) return; // never overlap itself: skip this tick
    job.running = true;
    try {
      await job.fn();
    } catch (err) {
      log(`job ${name} failed`, err);
    } finally {
      job.running = false;
    }
  }

  function register(name: string, fn: JobFn, delay: () => number): void {
    const job: Job = { fn, running: false };
    jobs.set(name, job);
    const arm = () => {
      if (stopped) return;
      job.timer = setTimeout(() => {
        arm(); // reschedule first so a slow or failing job never stops the cadence
        void run(name, job);
      }, delay());
    };
    arm();
  }

  return {
    every(name, ms, fn) {
      register(name, fn, () => ms);
    },
    dailyAt(name, time, tz, fn) {
      register(name, fn, () => {
        const now = opts.clock.now();
        return Math.max(0, nextDailyOccurrence(now, time, tz()).getTime() - now.getTime());
      });
    },
    async runNow(name) {
      const job = jobs.get(name);
      if (!job) throw new Error(`unknown job: ${name}`);
      await run(name, job);
    },
    stop() {
      stopped = true;
      for (const job of jobs.values()) clearTimeout(job.timer);
    },
  };
}

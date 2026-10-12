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

const MAX_TIMER_MS = 2 ** 31 - 1;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A re-arm after a run that lands this close to an occurrence is the same occurrence firing early. */
const EARLY_FIRE_GUARD_MS = 1000;

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

  function register(name: string, fn: JobFn, delay: (afterRun: boolean) => number): void {
    if (jobs.has(name)) throw new Error(`duplicate job: ${name}`);
    const job: Job = { fn, running: false };
    jobs.set(name, job);
    const arm = (afterRun: boolean) => {
      if (stopped) return;
      job.timer = setTimeout(() => {
        arm(true); // reschedule first so a slow or failing job never stops the cadence
        void run(name, job);
      }, delay(afterRun));
    };
    arm(false);
  }

  return {
    every(name, ms, fn) {
      if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMER_MS) {
        throw new Error(`invalid interval for job ${name}: ${ms} (must be > 0 and <= ${MAX_TIMER_MS})`);
      }
      register(name, fn, () => ms);
    },
    dailyAt(name, time, tz, fn) {
      if (!TIME_RE.test(time)) throw new Error(`invalid time for job ${name}: ${time} (expected HH:mm)`);
      register(name, fn, (afterRun) => {
        const now = opts.clock.now();
        let next = nextDailyOccurrence(now, time, tz());
        if (afterRun && next.getTime() - now.getTime() < EARLY_FIRE_GUARD_MS) {
          // Timer fired slightly early: skip the occurrence that just ran, take the following day's.
          next = nextDailyOccurrence(new Date(now.getTime() + EARLY_FIRE_GUARD_MS), time, tz());
        }
        return Math.max(0, next.getTime() - now.getTime());
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

import type { BusyInterval } from '@life-tracker/shared';

/** External busy time (e.g. Google Calendar) the planner must work around. */
export interface BusyProvider {
  busyIntervals(from: Date, to: Date): BusyInterval[];
}

export const emptyBusyProvider: BusyProvider = { busyIntervals: () => [] };

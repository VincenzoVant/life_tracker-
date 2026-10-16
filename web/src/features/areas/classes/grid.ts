import { CATEGORY_META, type Course, type FixedEvent, type Preferences } from '@life-tracker/shared';

export const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Buffer the planner keeps around `ev`: its own, or the class default (classes) / general buffer (work). */
export function effectiveBuffer(ev: FixedEvent, prefs: Preferences): { before: number; after: number } {
  const def = ev.kind === 'class' ? prefs.classBuffer : { before: prefs.bufferMinutes, after: prefs.bufferMinutes };
  return { before: ev.bufferBefore ?? def.before, after: ev.bufferAfter ?? def.after };
}

export function eventColor(ev: FixedEvent, courses: Course[]): string {
  if (ev.kind === 'work') return CATEGORY_META.work.color;
  return courses.find((c) => c.id === ev.courseId)?.color ?? CATEGORY_META.study.color;
}

/** Black or white, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return '#fff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111' : '#fff';
}

/** Whole hours shown by the grid: at least 08:00-18:00, widened to fit every event and its buffers. */
export function hourRange(events: FixedEvent[], prefs: Preferences): { from: number; to: number } {
  let from = 8 * 60;
  let to = 18 * 60;
  for (const ev of events) {
    const buf = effectiveBuffer(ev, prefs);
    from = Math.min(from, toMinutes(ev.startTime) - buf.before);
    to = Math.max(to, toMinutes(ev.endTime) + buf.after);
  }
  return { from: Math.max(0, Math.floor(from / 60)), to: Math.min(24, Math.ceil(to / 60)) };
}

export interface Placed {
  ev: FixedEvent;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for events of one day that overlap in time. */
export function layoutDay(events: FixedEvent[]): Placed[] {
  const sorted = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = '';
  let laneEnds: string[] = [];
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const ev of sorted) {
    if (cluster.length && ev.startTime >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= ev.startTime);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = ev.endTime;
    const p = { ev, lane, lanes: 1 };
    cluster.push(p);
    out.push(p);
    clusterEnd = cluster.length === 1 ? ev.endTime : ev.endTime > clusterEnd ? ev.endTime : clusterEnd;
  }
  flush();
  return out;
}

/** Minutes per week of the given events. */
export const weeklyMinutes = (events: FixedEvent[]): number =>
  events.reduce((sum, ev) => sum + toMinutes(ev.endTime) - toMinutes(ev.startTime), 0);

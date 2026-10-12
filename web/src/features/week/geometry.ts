import { zonedToUtc, type Block, type Preferences } from '@life-tracker/shared';

export const PX_PER_HOUR = 48;

function hoursOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/** Visible hour range: one hour of padding around the earliest/latest block times, clamped to the day. */
export function gridHours(prefs: Pick<Preferences, 'earliestBlock' | 'latestBlockEnd'>): { from: number; to: number } {
  return {
    from: Math.max(0, Math.floor(hoursOf(prefs.earliestBlock)) - 1),
    to: Math.min(24, Math.ceil(hoursOf(prefs.latestBlockEnd)) + 1),
  };
}

/** Pixels from the top of the grid to the block start; `date` is the local day the column represents. */
export function blockTop(block: Pick<Block, 'start'>, date: string, tz: string, hours: { from: number }): number {
  const dayStart = zonedToUtc(date, '00:00', tz).getTime();
  const hoursIntoDay = (new Date(block.start).getTime() - dayStart) / 3_600_000;
  return (hoursIntoDay - hours.from) * PX_PER_HOUR;
}

export function blockHeight(block: Pick<Block, 'start' | 'end'>): number {
  return ((new Date(block.end).getTime() - new Date(block.start).getTime()) / 3_600_000) * PX_PER_HOUR;
}

/** Vertical drag distance to minutes, snapped to 15. */
export function minutesFromPixels(dy: number): number {
  return Math.round(((dy / PX_PER_HOUR) * 60) / 15) * 15;
}

/** Side-by-side columns for overlapping blocks. `cols` is the column count of the block's overlap cluster. */
export function layoutOverlaps(
  blocks: Array<Pick<Block, 'id' | 'start' | 'end'>>,
): Map<string, { col: number; cols: number }> {
  const sorted = blocks
    .map((b) => ({ id: b.id, s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: Array<{ id: string; col: number }> = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { col: c.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const b of sorted) {
    if (b.s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= b.s);
    if (col === -1) col = colEnds.length;
    colEnds[col] = b.e;
    cluster.push({ id: b.id, col });
    clusterEnd = Math.max(clusterEnd, b.e);
  }
  flush();
  return out;
}

import type { Block } from '@life-tracker/shared';

/**
 * IDs of blocks that overlap another block (half-open intervals, so touching blocks don't count).
 * Removed and proposed blocks are ignored. Two meals overlapping each other don't count.
 */
export function overlapWarnings(blocks: Block[]): Set<string> {
  const live = blocks
    .filter((b) => b.status !== 'removed' && b.status !== 'proposed')
    .map((b) => ({ b, s: Date.parse(b.start), e: Date.parse(b.end) }))
    .sort((x, y) => x.s - y.s);
  const flagged = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length && live[j]!.s < live[i]!.e; j++) {
      const a = live[i]!.b;
      const b = live[j]!.b;
      if (a.category === 'meal' && b.category === 'meal') continue;
      flagged.add(a.id);
      flagged.add(b.id);
    }
  }
  return flagged;
}

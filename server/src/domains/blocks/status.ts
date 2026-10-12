import type { BlockStatus } from '@life-tracker/shared';

const REVIEWED: BlockStatus[] = ['done', 'partial', 'skipped'];

const TRANSITIONS: Record<BlockStatus, BlockStatus[]> = {
  proposed: ['committed', 'removed'],
  committed: [...REVIEWED, 'removed'],
  done: REVIEWED,
  partial: REVIEWED,
  skipped: REVIEWED,
  removed: [],
};

export function canTransition(from: BlockStatus, to: BlockStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

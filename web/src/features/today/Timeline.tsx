import { CATEGORY_META, localTimeOf, type Block, type BlockStatus } from '@life-tracker/shared';
import type { CSSProperties } from 'react';

const STATUS_ICON: Record<BlockStatus, { icon: string; label: string }> = {
  proposed: { icon: '◌', label: 'Proposed' },
  committed: { icon: '○', label: 'Planned' },
  done: { icon: '✓', label: 'Done' },
  partial: { icon: '◐', label: 'Partly done' },
  skipped: { icon: '✕', label: 'Skipped' },
  removed: { icon: '', label: 'Removed' },
};

export function Timeline({ blocks, tz }: { blocks: Block[]; tz: string }) {
  if (blocks.length === 0) return <p className="muted">Nothing scheduled today.</p>;
  return (
    <ul className="timeline" aria-label="Today's blocks">
      {blocks.map((b) => {
        const meta = CATEGORY_META[b.category];
        const status = STATUS_ICON[b.status];
        return (
          <li key={b.id} className={`timeline-item is-${b.status}`} style={{ '--cat-color': meta.color } as CSSProperties}>
            <span className="timeline-bar" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-time">
                {localTimeOf(new Date(b.start), tz)}–{localTimeOf(new Date(b.end), tz)}
              </div>
              <div className="timeline-title">{b.title}</div>
              <div className="timeline-cat">{meta.label}</div>
            </div>
            <span className="timeline-status" role="img" aria-label={status.label}>
              {status.icon}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

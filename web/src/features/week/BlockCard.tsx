import { CATEGORY_META, localTimeOf, type Block } from '@life-tracker/shared';
import type { CSSProperties, HTMLAttributes } from 'react';

export interface BlockCardProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onClick' | 'onSelect'> {
  block: Block;
  tz: string;
  onSelect?: (block: Block) => void;
  /** Absolute positioning supplied by the grid; omitted in the day list. */
  style?: CSSProperties;
}

/** A single block. Extra props (drag/resize handlers from Task 13) are spread onto the root button. */
export function BlockCard({ block, tz, onSelect, style, className, children, ...rest }: BlockCardProps) {
  const meta = CATEGORY_META[block.category];
  const proposed = block.status === 'proposed';
  const reviewed = block.status === 'done' || block.status === 'partial';
  return (
    <button
      type="button"
      {...rest}
      className={`block-card is-${block.status} ${className ?? ''}`.trim()}
      data-block-id={block.id}
      onClick={() => onSelect?.(block)}
      style={{
        background: meta.color,
        borderStyle: proposed ? 'dashed' : 'solid',
        opacity: block.status === 'skipped' ? 0.5 : 1,
        ...style,
      }}
    >
      <span className="block-card-title">
        {block.locked && (
          <span role="img" aria-label="Locked">
            🔒
          </span>
        )}
        {block.title}
      </span>
      <span className="block-card-time">
        {localTimeOf(new Date(block.start), tz)}–{localTimeOf(new Date(block.end), tz)}
      </span>
      {proposed && <span className="block-card-proposed">Proposed</span>}
      {reviewed && (
        <span className="block-card-badge" role="img" aria-label={block.status === 'done' ? 'Done' : 'Partly done'}>
          ✓
        </span>
      )}
      {children}
    </button>
  );
}

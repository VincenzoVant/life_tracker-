import { CATEGORY_META, localTimeOf, type Block } from '@life-tracker/shared';
import { useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type Ref } from 'react';
import { minutesFromPixels } from './geometry';

export interface BlockCardProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onClick' | 'onSelect'> {
  block: Block;
  tz: string;
  onSelect?: (block: Block) => void;
  /** Absolute positioning supplied by the grid; omitted in the day list. */
  style?: CSSProperties;
  /** Ref to the root button (the drag wrapper attaches dnd-kit's node here). */
  cardRef?: Ref<HTMLButtonElement>;
  /** When set, a drag handle at the bottom edge resizes the block; called with the end-time change in minutes. */
  onResize?: (block: Block, deltaMinutes: number) => void;
}

/** Pointer-drag handle on the bottom edge of a card. Previews the new height while dragging. */
function ResizeHandle({ block, onResize }: { block: Block; onResize: (block: Block, deltaMinutes: number) => void }) {
  const startY = useRef(0);
  function down(e: PointerEvent<HTMLSpanElement>) {
    e.stopPropagation(); // keep dnd-kit from starting a move
    e.preventDefault();
    const card = e.currentTarget.parentElement as HTMLElement;
    const originalHeight = card.style.height;
    const startHeight = card.offsetHeight;
    startY.current = e.clientY;
    const move = (ev: globalThis.PointerEvent) => {
      card.style.height = `${Math.max(8, startHeight + ev.clientY - startY.current)}px`;
    };
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      card.style.height = originalHeight;
      const minutes = minutesFromPixels(ev.clientY - startY.current);
      if (minutes !== 0) onResize(block, minutes);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  return (
    <span
      className="block-card-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize"
      data-testid={`resize-${block.id}`}
      onPointerDown={down}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** A single block. Extra props (drag handlers) are spread onto the root button. */
export function BlockCard({ block, tz, onSelect, style, className, children, cardRef, onResize, ...rest }: BlockCardProps) {
  const meta = CATEGORY_META[block.category];
  const proposed = block.status === 'proposed';
  const reviewed = block.status === 'done' || block.status === 'partial';
  return (
    <button
      type="button"
      {...rest}
      ref={cardRef}
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
      {onResize && <ResizeHandle block={block} onResize={onResize} />}
    </button>
  );
}

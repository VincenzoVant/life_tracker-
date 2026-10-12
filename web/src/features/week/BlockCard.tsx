import { CATEGORY_META, localDateOf, localTimeOf, type Block } from '@life-tracker/shared';
import { createContext, useContext, useEffect, useRef, type CSSProperties, type HTMLAttributes, type PointerEvent, type Ref } from 'react';
import { minutesFromPixels } from './geometry';

/** Assigned meal names keyed `${date}|${slot}`, provided by the week page. */
export const MealNamesContext = createContext<Record<string, string>>({});

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

interface ResizeDrag {
  pointerId: number;
  startY: number;
  startHeight: number;
  originalHeight: string;
  card: HTMLElement;
}

/**
 * Pointer-drag handle on the bottom edge of a card. Previews the new height while dragging. The handle captures the
 * pointer, so move/up/cancel all arrive here and nothing is left listening on the window.
 */
function ResizeHandle({ block, onResize }: { block: Block; onResize: (block: Block, deltaMinutes: number) => void }) {
  const drag = useRef<ResizeDrag | null>(null);
  const restore = () => {
    if (drag.current) drag.current.card.style.height = drag.current.originalHeight;
    drag.current = null;
  };
  useEffect(() => restore, []);
  function down(e: PointerEvent<HTMLSpanElement>) {
    e.stopPropagation(); // keep dnd-kit from starting a move
    e.preventDefault();
    const card = e.currentTarget.parentElement as HTMLElement;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startHeight: card.offsetHeight, originalHeight: card.style.height, card };
  }
  function move(e: PointerEvent<HTMLSpanElement>) {
    const d = drag.current;
    if (d) d.card.style.height = `${Math.max(8, d.startHeight + e.clientY - d.startY)}px`;
  }
  function up(e: PointerEvent<HTMLSpanElement>) {
    const d = drag.current;
    if (!d) return;
    restore();
    const minutes = minutesFromPixels(e.clientY - d.startY);
    if (minutes !== 0) onResize(block, minutes);
  }
  return (
    <span
      className="block-card-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize"
      data-testid={`resize-${block.id}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={restore}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** A single block. Extra props (drag handlers) are spread onto the root button. */
export function BlockCard({ block, tz, onSelect, style, className, children, cardRef, onResize, ...rest }: BlockCardProps) {
  const meta = CATEGORY_META[block.category];
  const proposed = block.status === 'proposed';
  const mealName = useContext(MealNamesContext)[`${localDateOf(new Date(block.start), tz)}|${block.mealSlot}`];
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
      {block.category === 'meal' && mealName && <span className="block-card-meal">{mealName}</span>}
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

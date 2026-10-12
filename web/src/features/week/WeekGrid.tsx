import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { localDateOf, type Block, type Preferences } from '@life-tracker/shared';
import type { CSSProperties, ReactNode } from 'react';
import { BlockCard } from './BlockCard';
import { blocksOnDate, dayLabel } from './days';
import { PX_PER_HOUR, blockHeight, blockTop, canDrag, extendGridHours, gridHours, layoutOverlaps, minutesFromPixels } from './geometry';

export interface WeekGridProps {
  dates: string[];
  blocks: Block[];
  prefs: Pick<Preferences, 'earliestBlock' | 'latestBlockEnd'>;
  tz: string;
  onSelect: (block: Block) => void;
  /** Drag a card: vertical distance as minutes (snapped to 15) and the number of day columns crossed. */
  onMove?: (block: Block, deltaMinutes: number, dayDelta: number) => void;
  /** Drag a card's bottom handle: change of the end time in minutes. */
  onResize?: (block: Block, deltaMinutes: number) => void;
  /** Lets other features wrap a card. Receives the default card. */
  renderBlock?: (block: Block, card: ReactNode, ctx: { date: string }) => ReactNode;
  /** IDs to mark with ⚠ (see `overlapWarnings`). */
  overlaps?: Set<string>;
}

/** The subset of dnd-kit's DragEndEvent that the handler reads. */
export interface DragEndLike {
  active: { id: string | number; data?: { current?: { date?: string } } };
  delta: { x?: number; y: number };
  over: { id: string | number } | null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Turns a finished drag into `onMove(block, deltaMinutes, dayDelta)`. Ignores drops outside a day column and undraggable blocks. */
export function handleDragEnd(
  event: DragEndLike,
  blocks: Block[],
  onMove: (block: Block, deltaMinutes: number, dayDelta: number) => void,
  tz = 'UTC',
): void {
  const { active, delta, over } = event;
  if (!over) return;
  const block = blocks.find((b) => b.id === active.id);
  if (!block || !canDrag(block)) return;
  const from = active.data?.current?.date ?? localDateOf(new Date(block.start), tz);
  const dayDelta = daysBetween(from, String(over.id));
  const deltaMinutes = minutesFromPixels(delta.y);
  if (deltaMinutes === 0 && dayDelta === 0) return;
  onMove(block, deltaMinutes, dayDelta);
}

function DayColumn({ date, height, from, children }: { date: string; height: number; from: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'week-col is-over' : 'week-col'}
      role="group"
      aria-label={`Day ${date}`}
      data-date={date}
      data-px-per-hour={PX_PER_HOUR}
      data-grid-from={from}
      style={{ height }}
    >
      {children}
    </div>
  );
}

function DraggableCard({
  block,
  date,
  tz,
  onSelect,
  onResize,
  overlap,
  style,
}: {
  block: Block;
  date: string;
  tz: string;
  onSelect: (block: Block) => void;
  onResize?: (block: Block, deltaMinutes: number) => void;
  overlap?: boolean;
  style: CSSProperties;
}) {
  const draggable = canDrag(block);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { date },
    disabled: !draggable,
  });
  return (
    <BlockCard
      block={block}
      tz={tz}
      onSelect={onSelect}
      overlap={overlap}
      cardRef={setNodeRef}
      onResize={draggable ? onResize : undefined}
      className={isDragging ? 'is-dragging' : undefined}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      style={{
        ...style,
        ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
      }}
    />
  );
}

/** Seven day columns with an hour gutter. Each column carries `data-date`, `data-px-per-hour` and `data-grid-from` for hit-testing. */
export function WeekGrid({ dates, blocks, prefs, tz, onSelect, onMove, onResize, renderBlock, overlaps }: WeekGridProps) {
  const hours = extendGridHours(gridHours(prefs), blocks.filter((b) => b.status !== 'removed'), tz);
  const height = (hours.to - hours.from) * PX_PER_HOUR;
  const labels = Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i);
  // A small activation distance keeps a plain click opening the details dialog.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={(e) => onMove && handleDragEnd(e, blocks, onMove, tz)}
    >
      <div className="week-grid" role="group" aria-label="Week grid" style={{ ['--px-per-hour' as string]: `${PX_PER_HOUR}px` }}>
        <div className="week-grid-head">
          <div className="week-gutter" />
          {dates.map((d) => (
            <div key={d} className="week-colhead">
              {dayLabel(d)}
            </div>
          ))}
        </div>
        <div className="week-grid-body">
          <div className="week-gutter" style={{ height }}>
            {labels.map((h) => (
              <div key={h} className="week-hour-label" style={{ height: PX_PER_HOUR }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {dates.map((date) => {
            const dayBlocks = blocksOnDate(blocks, date, tz);
            const layout = layoutOverlaps(dayBlocks);
            return (
              <DayColumn key={date} date={date} height={height} from={hours.from}>
                {dayBlocks.map((b) => {
                  const l = layout.get(b.id) ?? { col: 0, cols: 1 };
                  const style = {
                    position: 'absolute' as const,
                    top: blockTop(b, date, tz, hours),
                    height: blockHeight(b),
                    left: `${(l.col / l.cols) * 100}%`,
                    width: `${100 / l.cols}%`,
                  };
                  const card = (
                    <DraggableCard key={b.id} block={b} date={date} tz={tz} onSelect={onSelect} onResize={onResize} overlap={overlaps?.has(b.id)} style={style} />
                  );
                  return renderBlock ? <span key={b.id}>{renderBlock(b, card, { date })}</span> : card;
                })}
              </DayColumn>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}

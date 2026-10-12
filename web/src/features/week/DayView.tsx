import type { Block } from '@life-tracker/shared';
import { useRef, type ReactNode } from 'react';
import { BlockCard } from './BlockCard';
import { blocksOnDate, dayLabel } from './days';

export interface DayViewProps {
  date: string;
  blocks: Block[];
  tz: string;
  onSelect: (block: Block) => void;
  onPrev: () => void;
  onNext: () => void;
  renderBlock?: (block: Block, card: ReactNode, ctx: { date: string }) => ReactNode;
  /** IDs to mark with ⚠ (see `overlapWarnings`). */
  overlaps?: Set<string>;
}

/** Single-day list for narrow screens. Horizontal swipe (> 60px) moves between days. */
export function DayView({ date, blocks, tz, onSelect, onPrev, onNext, renderBlock, overlaps }: DayViewProps) {
  const startX = useRef<number | null>(null);
  const day = blocksOnDate(blocks, date, tz);
  return (
    <div
      className="day-view"
      onTouchStart={(e) => {
        startX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (startX.current !== null && x !== undefined) {
          const dx = x - startX.current;
          if (Math.abs(dx) > 60) (dx < 0 ? onNext : onPrev)();
        }
        startX.current = null;
      }}
    >
      <div className="day-view-nav">
        <button type="button" onClick={onPrev} aria-label="Previous day">
          ‹
        </button>
        <h2 aria-live="polite">{dayLabel(date)}</h2>
        <button type="button" onClick={onNext} aria-label="Next day">
          ›
        </button>
      </div>
      {day.length === 0 && <p className="muted">Nothing scheduled.</p>}
      <div className="day-view-list" data-date={date}>
        {day.map((b) => {
          const card = <BlockCard key={b.id} block={b} tz={tz} onSelect={onSelect} overlap={overlaps?.has(b.id)} />;
          return renderBlock ? <div key={b.id}>{renderBlock(b, card, { date })}</div> : card;
        })}
      </div>
    </div>
  );
}

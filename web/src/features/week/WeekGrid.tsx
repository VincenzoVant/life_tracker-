import type { Block, Preferences } from '@life-tracker/shared';
import type { ReactNode } from 'react';
import { BlockCard } from './BlockCard';
import { blocksOnDate, dayLabel } from './days';
import { PX_PER_HOUR, blockHeight, blockTop, gridHours, layoutOverlaps } from './geometry';

export interface WeekGridProps {
  dates: string[];
  blocks: Block[];
  prefs: Pick<Preferences, 'earliestBlock' | 'latestBlockEnd'>;
  tz: string;
  onSelect: (block: Block) => void;
  /** Lets Task 13 wrap a card with drag/resize behaviour. Receives the default card. */
  renderBlock?: (block: Block, card: ReactNode, ctx: { date: string }) => ReactNode;
}

/** Seven day columns with an hour gutter. Each column carries `data-date`, `data-px-per-hour` and `data-grid-from` for hit-testing. */
export function WeekGrid({ dates, blocks, prefs, tz, onSelect, renderBlock }: WeekGridProps) {
  const hours = gridHours(prefs);
  const height = (hours.to - hours.from) * PX_PER_HOUR;
  const labels = Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i);
  return (
    <div className="week-grid" role="group" aria-label="Week grid">
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
            <div
              key={date}
              className="week-col"
              role="group"
              aria-label={`Day ${date}`}
              data-date={date}
              data-px-per-hour={PX_PER_HOUR}
              data-grid-from={hours.from}
              style={{ height }}
            >
              {dayBlocks.map((b) => {
                const l = layout.get(b.id) ?? { col: 0, cols: 1 };
                const card = (
                  <BlockCard
                    key={b.id}
                    block={b}
                    tz={tz}
                    onSelect={onSelect}
                    style={{
                      position: 'absolute',
                      top: blockTop(b, date, tz, hours),
                      height: blockHeight(b),
                      left: `${(l.col / l.cols) * 100}%`,
                      width: `${100 / l.cols}%`,
                    }}
                  />
                );
                return renderBlock ? <span key={b.id}>{renderBlock(b, card, { date })}</span> : card;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

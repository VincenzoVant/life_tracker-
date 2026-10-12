import {
  DEFAULT_PREFERENCES,
  addDays,
  isoWeekday,
  localDateOf,
  weekDates,
  weekRangeUtc,
  weekStartOf,
  type Block,
} from '@life-tracker/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBlocks } from '../../api/hooks/blocks';
import { usePreferences } from '../../api/hooks/preferences';
import { useSettings, useTimezone } from '../../api/hooks/settings';
import { BlockDetails } from './BlockDetails';
import { DayView } from './DayView';
import { WeekGrid } from './WeekGrid';
import { useBlockEditing } from './useBlockEditing';
import './week.css';

export const WIDE_BREAKPOINT = 768;

export interface WeekPageProps {
  /** Rendered above the grid: draft panel / plan button (Task 14). */
  header?: (ctx: { weekStart: string; tz: string }) => ReactNode;
  /** Wraps each card (drag/resize, Task 13). */
  renderBlock?: (block: Block, card: ReactNode, ctx: { date: string }) => ReactNode;
  /** Extra controls inside the block details dialog (meal assignment, Task 15). */
  detailsActions?: (block: Block) => ReactNode;
}

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.innerWidth >= WIDE_BREAKPOINT);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return wide;
}

/** Waits for settings so the week boundaries use the configured timezone. */
export function WeekPage(props: WeekPageProps) {
  const settings = useSettings();
  if (settings.isPending) return <p className="muted">Loading…</p>;
  return <WeekContent {...props} />;
}

function WeekContent({ header, renderBlock, detailsActions }: WeekPageProps) {
  const tz = useTimezone();
  const wide = useIsWide();
  const today = localDateOf(new Date(), tz);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date(), tz));
  const [day, setDay] = useState(today);
  const [selected, setSelected] = useState<Block>();
  const prefs = usePreferences().data ?? DEFAULT_PREFERENCES;
  const editing = useBlockEditing(tz);

  const range = useMemo(() => {
    const r = weekRangeUtc(weekStart, tz);
    return { from: r.start.toISOString(), to: r.end.toISOString() };
  }, [weekStart, tz]);
  const { data, isPending, isError } = useBlocks(range);
  const blocks = useMemo(() => data ?? [], [data]);
  const dates = weekDates(weekStart);

  function shiftWeek(n: number) {
    setWeekStart((w) => addDays(w, 7 * n));
    setDay((d) => addDays(d, 7 * n));
  }
  function shiftDay(n: number) {
    const next = addDays(day, n);
    setDay(next);
    setWeekStart(addDays(next, 1 - isoWeekday(next)));
  }

  return (
    <div className="week-page">
      <div className="week-header">
        <h1>Week</h1>
        <div className="week-switcher">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week">
            ‹
          </button>
          <span>
            {dates[0]} – {dates[6]}
          </span>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week">
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekStart(weekStartOf(new Date(), tz));
              setDay(today);
            }}
          >
            This week
          </button>
        </div>
      </div>
      {header?.({ weekStart, tz })}
      {isPending && <p className="muted">Loading…</p>}
      {isError && (
        <p className="error" role="alert">
          Could not load the week.
        </p>
      )}
      {!isPending &&
        !isError &&
        (wide ? (
          <WeekGrid
            dates={dates}
            blocks={blocks}
            prefs={prefs}
            tz={tz}
            onSelect={setSelected}
            onMove={editing.onMove}
            onResize={editing.onResize}
            renderBlock={renderBlock}
          />
        ) : (
          <DayView
            date={day}
            blocks={blocks}
            tz={tz}
            onSelect={setSelected}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            renderBlock={renderBlock}
          />
        ))}
      {selected && (
        <BlockDetails block={selected} tz={tz} onClose={() => setSelected(undefined)} actions={detailsActions?.(selected)} />
      )}
    </div>
  );
}

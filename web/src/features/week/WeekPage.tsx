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
import { useSearchParams } from 'react-router';
import { useBlocks } from '../../api/hooks/blocks';
import { useBlockById } from '../../api/hooks/google';
import { useToast } from '../../components/Toast';
import { usePreferences } from '../../api/hooks/preferences';
import { useSettings, useTimezone } from '../../api/hooks/settings';
import { useDraft } from '../../api/hooks/plans';
import { useMealPlan } from '../../api/hooks/mealPlan';
import { MealNamesContext } from './BlockCard';
import { BlockDetails } from './BlockDetails';
import { DraftPanel, PlanBar } from './DraftPanel';
import { DayView } from './DayView';
import { WeekGrid } from './WeekGrid';
import { overlapWarnings } from './overlaps';
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
  // `?week=<date>` opens that week (e.g. after applying a replan); any date in the week works.
  const [params, setParams] = useSearchParams();
  const [initialWeek] = useState(() => {
    const w = params.get('week');
    return w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? addDays(w, 1 - isoWeekday(w)) : null;
  });
  const [weekStart, setWeekStart] = useState(() => initialWeek ?? weekStartOf(new Date(), tz));
  const [day, setDay] = useState(() => (initialWeek && initialWeek !== weekStartOf(new Date(), tz) ? initialWeek : today));
  // Store the id, not the block, so the details dialog follows refetches. `linkedBlock` covers a deep link whose week hasn't loaded yet.
  const [selectedId, setSelectedId] = useState<string>();
  const [linkedBlock, setLinkedBlock] = useState<Block>();
  const prefs = usePreferences().data ?? DEFAULT_PREFERENCES;
  const editing = useBlockEditing(tz);
  const thisWeek = weekStartOf(new Date(), tz);
  // Past weeks cannot be planned, so they have no draft to look up.
  const draftQuery = useDraft(weekStart, { enabled: weekStart >= thisWeek });
  // Only a full-week draft is the weekly draft; replan drafts live on their own page.
  const draft = draftQuery.data?.plan.mode === 'full' ? draftQuery.data : undefined;

  // Deep link from Google events: /week?block=<id> jumps to that block's week and opens its details.
  const linkedId = params.get('block');
  const linked = useBlockById(linkedId);
  const toast = useToast();
  useEffect(() => {
    if (!linkedId || linked.isPending) return;
    if (linked.data) {
      const date = localDateOf(new Date(linked.data.start), tz);
      setWeekStart(weekStartOf(new Date(linked.data.start), tz));
      setDay(date);
      setLinkedBlock(linked.data);
      setSelectedId(linked.data.id);
    } else {
      toast.show('That block no longer exists', 'error');
    }
    setParams(
      (p) => {
        p.delete('block');
        return p;
      },
      { replace: true },
    );
  }, [linkedId, linked.isPending, linked.data, tz, toast, setParams]);

  const range = useMemo(() => {
    const r = weekRangeUtc(weekStart, tz);
    return { from: r.start.toISOString(), to: r.end.toISOString() };
  }, [weekStart, tz]);
  const { data, isPending, isError } = useBlocks(range);
  const blocks = useMemo(() => data ?? [], [data]);
  const selected = selectedId ? (blocks.find((b) => b.id === selectedId) ?? (linkedBlock?.id === selectedId && isPending ? linkedBlock : undefined)) : undefined;
  const dates = weekDates(weekStart);
  const overlaps = useMemo(() => overlapWarnings(blocks), [blocks]);
  const plan = useMealPlan(weekStart).data;
  const mealNames = useMemo(() => Object.fromEntries((plan ?? []).map((e) => [`${e.date}|${e.slot}`, e.meal.name])), [plan]);

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
    <MealNamesContext.Provider value={mealNames}>
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
      {draftQuery.isSuccess && <PlanBar weekStart={weekStart} thisWeek={thisWeek} hasDraft={!!draft} />}
      {header?.({ weekStart, tz })}
      <div className="week-body">
        <div className="week-main">
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
            onSelect={(b) => setSelectedId(b.id)}
            onMove={editing.onMove}
            onResize={editing.onResize}
            renderBlock={renderBlock}
            overlaps={overlaps}
          />
        ) : (
          <DayView
            date={day}
            blocks={blocks}
            tz={tz}
            onSelect={(b) => setSelectedId(b.id)}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            renderBlock={renderBlock}
            overlaps={overlaps}
          />
        ))}
        </div>
        {draft && <DraftPanel draft={draft} weekStart={weekStart} />}
      </div>
      {selected && (
        <BlockDetails block={selected} tz={tz} onClose={() => setSelectedId(undefined)} actions={detailsActions?.(selected)} />
      )}
    </div>
    </MealNamesContext.Provider>
  );
}

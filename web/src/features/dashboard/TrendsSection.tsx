import { useState } from 'react';
import type { WeekTrend } from '@life-tracker/shared';
import { useTrends } from '../../api/hooks/progress';
import { Sparkline } from './Sparkline';

const RANGES = [4, 12, 26] as const;
type Range = (typeof RANGES)[number];

const hours = (m: number) => m / 60;
const hoursOrNull = (m: number | null) => (m === null ? null : hours(m));
const fmtH = (v: number) => `${Number(v.toFixed(1))}h`;
const fmtN = (v: number) => String(Math.round(v));

interface Row {
  label: string;
  values: (number | null)[];
  goal?: (number | null)[];
  fmt: (v: number) => string;
}

function rowsOf(t: WeekTrend[]): Row[] {
  return [
    { label: 'Study hours', values: t.map((w) => hours(w.studyMinutes.actual)), goal: t.map((w) => hoursOrNull(w.studyMinutes.goal)), fmt: fmtH },
    { label: 'Startup hours', values: t.map((w) => hours(w.startupMinutes.actual)), goal: t.map((w) => hoursOrNull(w.startupMinutes.goal)), fmt: fmtH },
    { label: 'Work hours', values: t.map((w) => hours(w.workMinutes.actual)), fmt: fmtH },
    { label: 'Workouts', values: t.map((w) => w.workouts.actual), goal: t.map((w) => w.workouts.goal), fmt: fmtN },
    { label: 'Free evenings', values: t.map((w) => w.freeEvenings.actual), goal: t.map((w) => w.freeEvenings.goal), fmt: fmtN },
    { label: 'Average kcal', values: t.map((w) => w.avgKcal), fmt: fmtN },
    { label: 'Average protein', values: t.map((w) => w.avgProteinG), fmt: (v) => `${Math.round(v)} g` },
  ];
}

export function TrendsSection() {
  const [weeks, setWeeks] = useState<Range>(12);
  const { data, isError } = useTrends(weeks);
  return (
    <section className="trends" aria-labelledby="trends-title">
      <div className="trends-head">
        <h2 id="trends-title">Trends</h2>
        <div role="tablist" aria-label="Range" className="trends-tabs">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={weeks === r} className={weeks === r ? 'primary' : undefined} onClick={() => setWeeks(r)}>
              {r} weeks
            </button>
          ))}
        </div>
      </div>
      {isError && (
        <p className="error" role="alert">
          Could not load trends.
        </p>
      )}
      {data && (
        <ul className="area-list">
          {rowsOf(data).map((r) => {
            const latest = r.values[r.values.length - 1] ?? null;
            const goal = r.goal?.[r.goal.length - 1] ?? null;
            return (
              <li key={r.label} className="dash-row trend-row">
                <div>
                  <div className="dash-row-label">{r.label}</div>
                  <div className="muted dash-row-summary">
                    {latest === null ? 'no data' : r.fmt(latest)}
                    {goal !== null && ` / goal ${r.fmt(goal)}`}
                  </div>
                </div>
                <Sparkline values={r.values} goal={r.goal} label={r.label} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

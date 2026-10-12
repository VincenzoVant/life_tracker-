import type { CSSProperties, ReactNode } from 'react';
import './dashboard.css';

export interface RowMetric {
  goal?: number | null;
  planned: number;
  actual: number;
}

export const formatMinutes = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10}h`;
export const formatCount = (n: number) => String(n);

/** One dashboard row: solid bar = actual, outlined bar = planned, tick = goal. */
export function AreaProgressRow({
  label,
  color,
  metric,
  format = formatMinutes,
  children,
}: {
  label: string;
  color?: string;
  metric: RowMetric;
  format?: (n: number) => string;
  children?: ReactNode;
}) {
  const goal = metric.goal ?? null;
  const max = Math.max(goal ?? 0, metric.planned, metric.actual, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const summary = `${format(metric.actual)} actual · ${format(metric.planned)} planned · ${goal === null ? 'no goal' : `goal ${format(goal)}`}`;
  return (
    <li className="area-row" style={color ? ({ '--bar-color': color } as CSSProperties) : undefined}>
      <div className="area-row-head">
        <span className="area-row-label">{label}</span>
        <span className="muted area-row-summary">{summary}</span>
      </div>
      <div className="area-bar" role="img" aria-label={`${label}: ${summary}`}>
        <div className="area-bar-planned" style={{ width: pct(metric.planned) }} />
        <div className="area-bar-actual" style={{ width: pct(metric.actual) }} />
        {goal !== null && <div className="area-bar-goal" style={{ left: pct(goal) }} />}
      </div>
      {children}
    </li>
  );
}

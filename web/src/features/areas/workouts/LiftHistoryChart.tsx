import { epley1rm, type TopSet } from '@life-tracker/shared';
import './workouts.css';

const W = 320;
const H = 160;
const PAD = { l: 36, r: 12, t: 12, b: 24 };

/** Inline SVG line of e1RM over time (oldest to newest, evenly spaced). */
export function LiftHistoryChart({ sets, name }: { sets: TopSet[]; name: string }) {
  const pts = [...sets].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, v: epley1rm(s.weightKg, s.reps) }));
  if (pts.length === 0) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const inner = W - PAD.l - PAD.r;
  const x = (i: number) => PAD.l + (pts.length === 1 ? inner / 2 : (i / (pts.length - 1)) * inner);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const label = `${name} estimated 1RM over time: ${pts.length} sets from ${first.date} to ${last.date}, from ${min.toFixed(1)} kg to ${max.toFixed(1)} kg`;
  return (
    <svg className="wk-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} />
      <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
      <text x={PAD.l - 4} y={y(max) + 4} textAnchor="end">{max.toFixed(0)}</text>
      <text x={PAD.l - 4} y={y(min) + 4} textAnchor="end">{min.toFixed(0)}</text>
      <text x={PAD.l} y={H - 6}>{first.date}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end">{last.date}</text>
      {pts.length > 1 && <path className="line" d={path} />}
      {pts.map((p, i) => (
        <circle key={i} className="dot" cx={x(i)} cy={y(p.v)} r={3} />
      ))}
    </svg>
  );
}

const W = 120;
const H = 32;
const PAD = 3;

/** Tiny inline line chart of one value per week; the dashed line is the goal (when set). */
export function Sparkline({ values, goal, label }: { values: number[]; goal?: (number | null)[]; label: string }) {
  const goals = (goal ?? []).filter((g): g is number => g !== null);
  const max = Math.max(1, ...values, ...goals);
  const x = (i: number) => (values.length < 2 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (values.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const goalPts = (goal ?? []).flatMap((g, i) => (g === null ? [] : [`${x(i).toFixed(1)},${y(g).toFixed(1)}`]));
  const latest = values.length ? values[values.length - 1]! : 0;
  const last = values.length ? { cx: x(values.length - 1), cy: y(latest) } : null;
  return (
    <svg className="sparkline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${Number(latest.toFixed(1))} this week`}>
      {goalPts.length > 1 && <polyline points={goalPts.join(' ')} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
      {values.length > 1 && <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {last && <circle cx={last.cx} cy={last.cy} r={2.5} fill="var(--accent)" />}
    </svg>
  );
}

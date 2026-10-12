const W = 120;
const H = 32;
const PAD = 3;

/** Tiny inline line chart of one value per week; null weeks leave a gap. The dashed line is the goal (when set). */
export function Sparkline({ values, goal, label }: { values: (number | null)[]; goal?: (number | null)[]; label: string }) {
  const goals = (goal ?? []).filter((g): g is number => g !== null);
  const max = Math.max(1, ...values.filter((v): v is number => v !== null), ...goals);
  const x = (i: number) => (values.length < 2 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (values.length - 1));
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  // Consecutive non-null weeks form one segment; a null week ends it.
  const segments: Array<Array<{ i: number; v: number }>> = [];
  values.forEach((v, i) => {
    if (v === null) {
      segments.push([]);
      return;
    }
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1]!.push({ i, v });
  });
  const lines = segments.filter((s) => s.length > 1);
  const lonely = segments.filter((s) => s.length === 1).map((s) => s[0]!);
  const goalPts = (goal ?? []).flatMap((g, i) => (g === null ? [] : [`${x(i).toFixed(1)},${y(g).toFixed(1)}`]));
  const latest = values.length ? values[values.length - 1]! : null;
  const summary = latest === null ? 'no data this week' : `${Number(latest.toFixed(1))} this week`;
  return (
    <svg className="sparkline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${summary}`}>
      {goalPts.length > 1 && <polyline points={goalPts.join(' ')} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
      {lines.map((s) => (
        <polyline
          key={s[0]!.i}
          points={s.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {lonely
        .filter((p) => p.i !== values.length - 1)
        .map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={1.5} fill="var(--accent)" />
        ))}
      {latest !== null && <circle cx={x(values.length - 1)} cy={y(latest)} r={2.5} fill="var(--accent)" />}
    </svg>
  );
}

import type { CSSProperties } from 'react';

export function ProgressBar({ value, max, color, label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      style={color ? ({ '--bar-color': color } as CSSProperties) : undefined}
    >
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

import type { ApiPlanChange, ReplanDraft } from '@life-tracker/shared';
import { useSettings, useTimezone } from '../../api/hooks/settings';
import { describeShortfall } from '../week/DraftPanel';

const hours = (ms: number): string => `${Number((ms / 3_600_000).toFixed(2))} h`;
const span = (s: { start: string; end: string }): number => new Date(s.end).getTime() - new Date(s.start).getTime();

function stamp(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('hour')}:${get('minute')}`;
}
const weekday = (iso: string, tz: string): string => stamp(iso, tz).split(' ')[0]!;

function Section({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

export function ChangeSummary({ draft }: { draft: ReplanDraft }) {
  const tz = useTimezone();
  const settings = useSettings();
  if (settings.isPending) return <p className="muted">Loading…</p>; // times need the configured timezone
  const of = (type: ApiPlanChange['type']) => draft.changes.filter((c) => c.type === type);
  const reserved = draft.plan.summary.reservedEvenings.length;

  return (
    <div className="change-summary">
      <Section title="Moved" lines={of('moved').map((c) => `${c.title}: ${stamp(c.from!.start, tz)} → ${stamp(c.to!.start, tz)}`)} />
      <Section
        title="Shortened"
        lines={of('shortened').map((c) => `${c.title}: ${weekday(c.from!.start, tz)} ${hours(span(c.from!))} → ${hours(span(c.to!))}`)}
      />
      <Section title="Removed" lines={of('removed').map((c) => `${c.title}: ${stamp(c.from!.start, tz)}`)} />
      <Section title="Added" lines={of('added').map((c) => `${c.title}: ${stamp(c.to!.start, tz)}`)} />
      {draft.shortfalls.length > 0 && (
        <ul className="shortfalls" aria-label="Can't fit">
          {draft.shortfalls.map((s, i) => (
            <li key={i}>{describeShortfall(s, reserved)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

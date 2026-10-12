import { localTimeOf, type GoogleChange } from '@life-tracker/shared';
import { useGoogleChanges, useMarkChangesSeen } from '../../api/hooks/google';
import { useTimezone } from '../../api/hooks/settings';

function describe(c: GoogleChange, tz: string): string {
  if (c.kind === 'deleted' || !c.afterStart) return `Deleted in Google: ${c.title}`;
  const start = new Date(c.afterStart);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(start);
  return `Moved in Google: ${c.title} → ${day} ${localTimeOf(start, tz)}`;
}

/** Unseen changes made to our events in Google; hidden when there are none. */
export function ChangesFeed() {
  const tz = useTimezone();
  const { data } = useGoogleChanges();
  const seen = useMarkChangesSeen();
  if (!data || data.length === 0) return null;
  return (
    <section className="card changes-feed" aria-label="Changes from Google">
      <h2 className="today-card-title">Changes from Google</h2>
      <ul>
        {data.map((c) => (
          <li key={c.id}>{describe(c, tz)}</li>
        ))}
      </ul>
      <button type="button" onClick={() => seen.mutate(data.map((c) => c.id))} disabled={seen.isPending}>
        Mark as seen
      </button>
    </section>
  );
}

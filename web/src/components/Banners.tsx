import { localTimeOf, type Conflict } from '@life-tracker/shared';
import { ApiError } from '../api/client';
import {
  useConflicts,
  useDismissConflict,
  useGoogleStatus,
  useRecreateCalendar,
} from '../api/hooks/google';
import { useTimezone } from '../api/hooks/settings';
import { useToast } from './Toast';
import './banners.css';

function when(c: Conflict, tz: string): string {
  const start = new Date(c.start);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(start);
  return `${day} ${localTimeOf(start, tz)}–${localTimeOf(new Date(c.end), tz)}`;
}

function ConflictBanner({ conflict }: { conflict: Conflict }) {
  const tz = useTimezone();
  const dismiss = useDismissConflict();

  const overlaps = conflict.blocks.map((b) => b.title).join(', ');
  return (
    <div className="banner" role="alert">
      <p>
        {conflict.title} ({when(conflict, tz)}) overlaps {overlaps || 'your plan'}
      </p>
      <div className="banner-actions">
        <button type="button" disabled title="Available after the replan update">
          Replan around this
        </button>
        <button type="button" onClick={() => dismiss.mutate(conflict.id)} disabled={dismiss.isPending}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Google-related notices above the page content; each shows only while its condition holds. */
export function Banners() {
  const { data: status } = useGoogleStatus();
  const { data: conflicts } = useConflicts();
  const recreate = useRecreateCalendar();
  const toast = useToast();

  async function onRecreate() {
    try {
      await recreate.mutateAsync();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not recreate the calendar', 'error');
    }
  }

  const items = [
    status?.needsReconnect && (
      <div key="reconnect" className="banner" role="alert">
        <p>Google Calendar needs to be reconnected</p>
        <a className="link-button" href="/api/google/connect">
          Reconnect
        </a>
      </div>
    ),
    status?.calendarMissing && (
      <div key="missing" className="banner" role="alert">
        <p>The Life Tracker calendar was deleted in Google</p>
        <button type="button" onClick={onRecreate} disabled={recreate.isPending}>
          Recreate calendar &amp; re-push
        </button>
      </div>
    ),
    ...(conflicts ?? []).map((c) => <ConflictBanner key={c.id} conflict={c} />),
  ].filter(Boolean);
  if (items.length === 0) return null;
  return <div className="banners">{items}</div>;
}

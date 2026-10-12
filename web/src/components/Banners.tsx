import { localTimeOf, type Conflict } from '@life-tracker/shared';
import { useNavigate } from 'react-router';
import {
  useConflicts,
  useDismissConflict,
  useGoogleStatus,
  useRecreateCalendar,
  useReplanFromConflict,
} from '../api/hooks/google';
import { useTimezone } from '../api/hooks/settings';
import { GoogleConnectAction } from './GoogleConnectAction';
import { useToast } from './Toast';
import './banners.css';

function when(c: Conflict, tz: string): string {
  const start = new Date(c.start);
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(start);
  return `${day} ${localTimeOf(start, tz)}–${localTimeOf(new Date(c.end), tz)}`;
}

function ConflictBanner({ conflict }: { conflict: Conflict }) {
  const tz = useTimezone();
  const navigate = useNavigate();
  const toast = useToast();
  const dismiss = useDismissConflict();
  const replan = useReplanFromConflict();

  async function onReplan() {
    try {
      const { draft } = await replan.mutateAsync(conflict.id);
      if (draft) navigate(`/replan/${draft.plan.id}`);
      else toast.show('Nothing needs to move');
    } catch (e) {
      toast.showError(e, 'Could not replan');
    }
  }

  const overlaps = conflict.blocks.map((b) => b.title).join(', ');
  return (
    <div className="banner" role="alert">
      <p>
        {conflict.title} ({when(conflict, tz)}) overlaps {overlaps || 'your plan'}
      </p>
      <div className="banner-actions">
        <button type="button" onClick={onReplan} disabled={replan.isPending}>
          Replan around this
        </button>
        <button type="button" onClick={() => dismiss.mutate(conflict.id, { onError: (e) => toast.showError(e, 'Could not dismiss') })} disabled={dismiss.isPending}>
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
      toast.showError(e, 'Could not recreate the calendar');
    }
  }

  const items = [
    status?.needsReconnect && (
      <div key="reconnect" className="banner" role="alert">
        <p>Google Calendar needs to be reconnected</p>
        <GoogleConnectAction label="Reconnect" hint="Reconnect" />
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

import { Link } from 'react-router';
import { useGoogleStatus } from '../api/hooks/google';

/** Header badge: hidden when nothing is waiting and nothing failed, or when Google Calendar isn't connected at all. */
export function SyncBadge() {
  const { data } = useGoogleStatus();
  if (!data) return null;
  if (data.failing > 0) {
    return (
      <Link to="/settings#settings-google" className="sync-badge sync-badge-error">
        Sync error
      </Link>
    );
  }
  // Without a connection nothing will ever sync, so a growing count would only be noise.
  if (data.pending > 0 && (data.connected || data.needsReconnect)) {
    return (
      <span className="sync-badge" role="status">
        {data.pending} {data.pending === 1 ? 'change' : 'changes'} waiting to sync
      </span>
    );
  }
  return null;
}

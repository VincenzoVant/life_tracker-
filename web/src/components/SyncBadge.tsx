import { Link } from 'react-router';
import { useGoogleStatus } from '../api/hooks/google';

/** Header badge: hidden when nothing is waiting and nothing failed. */
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
  if (data.pending > 0) {
    return (
      <span className="sync-badge" role="status">
        {data.pending} {data.pending === 1 ? 'change' : 'changes'} waiting to sync
      </span>
    );
  }
  return null;
}

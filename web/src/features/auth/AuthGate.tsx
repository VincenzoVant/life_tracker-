import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { UNAUTHORIZED_EVENT } from '../../api/client';
import { authKey, useAuthStatus } from '../../api/hooks/auth';
import { PinScreen } from './PinScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isPending, isError, refetch, isFetching } = useAuthStatus();

  useEffect(() => {
    const onUnauthorized = () => void qc.invalidateQueries({ queryKey: authKey });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  // While the server can't be reached, retry on focus / coming back online, and every few seconds.
  useEffect(() => {
    if (!isError) return;
    const retry = () => void refetch();
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    const id = setInterval(retry, 15_000);
    return () => {
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
      clearInterval(id);
    };
  }, [isError, refetch]);

  if (isPending) return <p className="muted" style={{ padding: 'var(--space-4)' }}>Loading…</p>;
  if (isError || !data) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <p className="error" role="alert">
          Can't reach the server.
        </p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching}>
          Retry
        </button>
      </div>
    );
  }
  if (!data.pinSet) return <PinScreen mode="setup" />;
  if (!data.authenticated) return <PinScreen mode="login" />;
  return <>{children}</>;
}

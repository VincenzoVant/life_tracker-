import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { UNAUTHORIZED_EVENT } from '../../api/client';
import { authKey, useAuthStatus } from '../../api/hooks/auth';
import { PinScreen } from './PinScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isPending, isError } = useAuthStatus();

  useEffect(() => {
    const onUnauthorized = () => void qc.invalidateQueries({ queryKey: authKey });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [qc]);

  if (isPending) return <p className="muted" style={{ padding: 'var(--space-4)' }}>Loading…</p>;
  if (isError || !data) return <p className="error" style={{ padding: 'var(--space-4)' }}>Can't reach the server.</p>;
  if (!data.pinSet) return <PinScreen mode="setup" />;
  if (!data.authenticated) return <PinScreen mode="login" />;
  return <>{children}</>;
}

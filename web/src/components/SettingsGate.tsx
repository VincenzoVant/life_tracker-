import type { ReactNode } from 'react';
import { useSettings } from '../api/hooks/settings';

/** Waits for settings so "today" and week boundaries use the configured timezone, not the browser's. */
export function SettingsGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  if (settings.isPending) return <p className="muted">Loading…</p>;
  return <>{children}</>;
}

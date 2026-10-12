import { isNetworkError } from '../api/client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error';
}
interface ToastApi {
  show: (message: string, kind?: 'info' | 'error') => void;
  /** Error toast for a caught error: shows its message (or `fallback`), and stays silent for network errors. */
  showError: (err: unknown, fallback: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, showError: () => {} });
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, message, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);
  const showError = useCallback(
    (err: unknown, fallback: string) => {
      if (isNetworkError(err)) return;
      show(err instanceof Error ? err.message : fallback, 'error');
    },
    [show],
  );
  const api = useMemo(() => ({ show, showError }), [show, showError]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={t.kind === 'error' ? 'toast error' : 'toast'}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

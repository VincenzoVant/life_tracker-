import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 30_000;
const TIMEOUT_MS = 5_000;
const FAILURES_BEFORE_OFFLINE = 2;

async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Polls /api/health every 30 s (and on focus/online). Two consecutive failures -> unreachable; one success -> ok. */
export function useServerHealth(): { status: 'ok' | 'unreachable'; retry: () => void } {
  const [status, setStatus] = useState<'ok' | 'unreachable'>('ok');
  const failures = useRef(0);
  const alive = useRef(true);

  const check = useCallback(async () => {
    const ok = await checkHealth();
    if (!alive.current) return;
    if (ok) {
      failures.current = 0;
      setStatus('ok');
    } else {
      failures.current += 1;
      if (failures.current >= FAILURES_BEFORE_OFFLINE) setStatus('unreachable');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    const onWake = () => void check();
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      alive.current = false;
      clearInterval(id);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [check]);

  return { status, retry: () => void check() };
}

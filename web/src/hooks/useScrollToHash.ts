import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Scrolls the element named by the URL hash into view (React Router does not do this on its own). */
export function useScrollToHash(): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'start' });
  }, [hash]);
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Google's OAuth redirect only works on the Mac itself, so on the phone we show where to do it instead of a link. */
export function isLoopbackHost(hostname: string = window.location.hostname): boolean {
  return LOOPBACK.has(hostname);
}

/** "Reconnect" / "Connect Google Calendar" link on the Mac; on any other host, a hint to do it on the Mac. */
export function GoogleConnectAction({ label, hint }: { label: string; hint: string }) {
  if (isLoopbackHost()) {
    return (
      <a className="link-button" href="/api/google/connect">
        {label}
      </a>
    );
  }
  return <span className="muted">{hint} on your Mac (http://127.0.0.1:4280)</span>;
}

export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main role="alert" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.25rem' }}>Life Tracker is offline — your Mac may be asleep or disconnected.</h1>
      <p style={{ opacity: 0.7, fontSize: '0.875rem' }}>Check that your Mac is awake and Tailscale is connected.</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </main>
  );
}

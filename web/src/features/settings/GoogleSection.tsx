import type { GoogleStatus } from '@life-tracker/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import {
  useDisconnectGoogle,
  useGoogleCalendars,
  useGoogleStatus,
  useSaveBusyCalendars,
  useSyncNow,
  useSyncStatus,
} from '../../api/hooks/google';
import { useToast } from '../../components/Toast';
import '../../components/banners.css';

function NotConfigured() {
  return (
    <div>
      <p>Google Calendar isn&apos;t set up yet. Follow the steps in <code>docs/setup-google.md</code> in the project folder:</p>
      <ol>
        <li>Create a Google Cloud project and enable the Google Calendar API.</li>
        <li>Create an OAuth client of type &quot;Desktop app&quot;.</li>
        <li>
          Download its JSON to <code>secrets/google-client.json</code> in the data folder.
        </li>
        <li>Restart Life Tracker and come back here.</li>
      </ol>
    </div>
  );
}

function Connected({ status }: { status: GoogleStatus }) {
  const toast = useToast();
  const calendars = useGoogleCalendars();
  const sync = useSyncStatus();
  const syncNow = useSyncNow();
  const saveBusy = useSaveBusyCalendars();
  const disconnect = useDisconnectGoogle();
  const [picked, setPicked] = useState<Set<string>>();
  const [allDay, setAllDay] = useState<boolean>();
  const [confirming, setConfirming] = useState(false);

  const selected = picked ?? new Set(status.busyCalendarIds);
  const includeAllDay = allDay ?? status.includeAllDay;

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.show(ok);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
    }
  }

  return (
    <div>
      <p>
        Connected. Events go to the <strong>Life Tracker</strong> calendar.
      </p>
      <p className="muted">Last sync: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'never'}</p>
      {status.lastError && (
        <p className="error" role="alert">
          {status.lastError}
        </p>
      )}
      {sync.data && sync.data.failing.length > 0 && (
        <ul aria-label="Failing items">
          {sync.data.failing.map((f) => (
            <li key={f.blockId} className="error">
              {f.title}: {f.lastError ?? 'failed'} ({f.attempts} attempts)
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="primary" onClick={() => run(() => syncNow.mutateAsync(), 'Sync complete')} disabled={syncNow.isPending}>
        Sync now
      </button>
      <hr className="settings-sep" />
      <fieldset>
        <legend>Calendars that count as busy</legend>
        {calendars.isPending && <p className="muted">Loading…</p>}
        <ul className="google-calendars">
          {(calendars.data ?? []).map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.summary}
                {c.primary ? ' (primary)' : ''}
              </label>
            </li>
          ))}
        </ul>
        <label className="google-toggle">
          <input type="checkbox" checked={includeAllDay} onChange={(e) => setAllDay(e.target.checked)} />
          Treat all-day events as busy
        </label>
        <button
          type="button"
          onClick={() =>
            run(() => saveBusy.mutateAsync({ calendarIds: [...selected], includeAllDay }), 'Calendars saved').then(() => {
              setPicked(undefined);
              setAllDay(undefined);
            })
          }
          disabled={saveBusy.isPending}
        >
          Save calendars
        </button>
      </fieldset>
      <hr className="settings-sep" />
      {confirming ? (
        <div role="alertdialog" aria-label="Confirm disconnect">
          <p>Disconnect Google? Events already in your Life Tracker calendar stay there.</p>
          <div className="form-actions">
            <button type="button" onClick={() => setConfirming(false)}>
              Keep connected
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => run(() => disconnect.mutateAsync(), 'Disconnected').then(() => setConfirming(false))}
              disabled={disconnect.isPending}
            >
              Confirm disconnect
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Disconnect
        </button>
      )}
    </div>
  );
}

export function GoogleSection() {
  const { data: status } = useGoogleStatus();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const result = params.get('google');
  const message = params.get('message');

  useEffect(() => {
    if (result !== 'connected' && result !== 'error') return;
    if (result === 'connected') toast.show('Google Calendar connected');
    else toast.show(message ?? 'Google connection failed', 'error');
    setParams(
      (p) => {
        p.delete('google');
        p.delete('message');
        return p;
      },
      { replace: true },
    );
  }, [result, message, toast, setParams]);

  if (!status) return <p className="muted">Loading…</p>;
  if (!status.configured) return <NotConfigured />;
  if (!status.connected) {
    return (
      <div>
        <p>
          <a className="link-button" href="/api/google/connect">
            Connect Google Calendar
          </a>
        </p>
        <p className="muted">Do this on your Mac.</p>
      </div>
    );
  }
  return <Connected status={status} />;
}

import type { ReactNode } from 'react';
import { useLogout } from '../../api/hooks/auth';
import { useScrollToHash } from '../../hooks/useScrollToHash';
import { useToast } from '../../components/Toast';
import { BackupsSection } from './BackupsSection';
import { ChangePinForm } from './ChangePinForm';
import { FixedScheduleSection } from './FixedScheduleSection';
import { GoalsForm } from './GoalsForm';
import { GoogleSection } from './GoogleSection';
import { PreferencesSection } from './PreferencesSection';
import { TimezoneForm } from './TimezoneForm';
import './settings.css';

export const APP_VERSION = '0.1.0';

export function LogoutButton() {
  const logout = useLogout();
  const toast = useToast();
  return (
    <button type="button" onClick={() => logout.mutate(undefined, { onError: (e) => toast.showError(e, 'Could not log out') })} disabled={logout.isPending}>
      Log out
    </button>
  );
}

function Security() {
  return (
    <>
      <ChangePinForm />
      <hr className="settings-sep" />
      <LogoutButton />
    </>
  );
}

function About() {
  return <p className="muted">Life Tracker v{APP_VERSION}</p>;
}

/** Later stages append entries here (Fixed schedule, Planner preferences, Google, Backups). */
const SECTIONS: Array<{ id: string; title: string; render: () => ReactNode }> = [
  { id: 'goals', title: 'Goals', render: () => <GoalsForm /> },
  { id: 'timezone', title: 'Timezone', render: () => <TimezoneForm /> },
  { id: 'schedule', title: 'Fixed schedule', render: () => <FixedScheduleSection /> },
  { id: 'preferences', title: 'Planner preferences', render: () => <PreferencesSection /> },
  { id: 'google', title: 'Google Calendar', render: () => <GoogleSection /> },
  { id: 'backups', title: 'Backups', render: () => <BackupsSection /> },
  { id: 'security', title: 'Security', render: () => <Security /> },
  { id: 'about', title: 'About', render: () => <About /> },
];

export function SettingsPage() {
  useScrollToHash();
  return (
    <div>
      <h1>Settings</h1>
      {SECTIONS.map((s) => (
        <section key={s.id} className="card settings-section" aria-labelledby={`settings-${s.id}`}>
          <h2 id={`settings-${s.id}`}>{s.title}</h2>
          {s.render()}
        </section>
      ))}
    </div>
  );
}

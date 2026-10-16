import type { ReactNode } from 'react';
import { useLogout } from '../../api/hooks/auth';
import { useScrollToHash } from '../../hooks/useScrollToHash';
import { useToast } from '../../components/Toast';
import { BackupsSection } from './BackupsSection';
import { ChangePinForm } from './ChangePinForm';
import { Link } from 'react-router';
import { DaySection } from './DaySection';
import { GoogleSection } from './GoogleSection';
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

const PLANNING_LINKS = [
  { to: '/areas/this-week', label: 'This week', what: 'projects, startup hours, relax time' },
  { to: '/areas/classes', label: 'Classes', what: 'fixed class schedule and buffers' },
  { to: '/areas/studies', label: 'Studies', what: 'what to study and when' },
  { to: '/areas/workouts', label: 'Workouts', what: 'gym schedule, goals and buffers' },
  { to: '/areas/meals', label: 'Meals', what: 'meal times, prep, menu, nutrition' },
  { to: '/areas/startup', label: 'Startup', what: 'tasks and when to work on them' },
];

/** Planning lives in the areas now; this points there. */
function PlanningLinks() {
  return (
    <>
      <p className="muted">Set up your week in Areas. The planner uses all of it when you plan from the Week tab.</p>
      <ul className="settings-links">
        {PLANNING_LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to}>{l.label}</Link> <span className="muted">· {l.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const SECTIONS: Array<{ id: string; title: string; render: () => ReactNode }> = [
  { id: 'planning', title: 'Planning', render: () => <PlanningLinks /> },
  { id: 'day', title: 'Day and evenings', render: () => <DaySection /> },
  { id: 'timezone', title: 'Timezone', render: () => <TimezoneForm /> },
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

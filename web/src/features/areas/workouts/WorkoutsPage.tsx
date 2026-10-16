import { useState } from 'react';
import { Link } from 'react-router';
import { WORKOUT_TYPES, addDays, localDateOf, weekStartOf, type WorkoutSession, type WorkoutType } from '@life-tracker/shared';
import { useGoals } from '../../../api/hooks/goals';
import { useWeekProgress } from '../../../api/hooks/progress';
import { useTimezone } from '../../../api/hooks/settings';
import { useDeleteSession, useWorkoutSessions } from '../../../api/hooks/workouts';
import { ProgressBar } from '../../../components/ProgressBar';
import { useToast } from '../../../components/Toast';
import { AreaTabs } from '../../../components/planning';
import { SettingsGate } from '../../../components/SettingsGate';
import { SessionForm, TYPE_LABEL } from './SessionForm';
import { WorkoutSchedule } from './WorkoutSchedule';
import './workouts.css';

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

function describe(s: WorkoutSession): string {
  const parts: string[] = [`${s.durationMinutes} min`];
  if (s.type === 'cardio') {
    if (s.distanceKm != null) parts.push(`${s.distanceKm} km`);
    if (s.paceSecPerKm != null) parts.push(formatPace(s.paceSecPerKm));
  }
  return parts.join(' · ');
}

function WorkoutsPageContent() {
  const tz = useTimezone();
  const now = new Date();
  const weekStart = weekStartOf(now, tz);
  const goals = useGoals();
  const progress = useWeekProgress(weekStart);

  return (
    <section>
      <div className="wk-head">
        <h1>Workouts</h1>
        <div className="wk-actions">
          <Link to="/areas/workouts/lifts">Top lifts</Link>
        </div>
      </div>

      <div className="card wk-week">
        <strong>This week</strong>
        {WORKOUT_TYPES.map((t) => {
          const m = progress.data?.workouts.byType[t];
          const goal = m?.goal ?? goals.data?.workoutsByType[t] ?? null;
          const actual = m?.actual ?? 0;
          return (
            <div key={t}>
              <div className="wk-row">
                <span>{TYPE_LABEL[t]}</span>
                <span>{goal != null ? `${actual} / ${goal}` : actual}</span>
              </div>
              {goal != null && <ProgressBar value={actual} max={goal} label={`${TYPE_LABEL[t]} sessions this week`} />}
            </div>
          );
        })}
      </div>

      <AreaTabs
        tabs={[
          { key: 'schedule', label: 'Schedule', render: () => <WorkoutSchedule /> },
          { key: 'sessions', label: 'Sessions', render: () => <Sessions /> },
        ]}
      />
    </section>
  );
}

function Sessions() {
  const tz = useTimezone();
  const today = localDateOf(new Date(), tz);
  const sessions = useWorkoutSessions({ from: addDays(today, -56), to: today });
  const [filter, setFilter] = useState<'all' | WorkoutType>('all');
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const del = useDeleteSession();
  const toast = useToast();

  const rows = [...(sessions.data ?? [])]
    .filter((s) => filter === 'all' || s.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <button className="primary" onClick={() => setLogging(true)}>
        Log session
      </button>

      <div className="wk-chips" role="group" aria-label="Filter by type">
        {(['all', ...WORKOUT_TYPES] as const).map((t) => (
          <button key={t} aria-pressed={filter === t} onClick={() => setFilter(t)}>
            {t === 'all' ? 'All' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {sessions.isLoading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No sessions in the last 8 weeks.</p>
      ) : (
        <ul className="wk-list">
          {rows.map((s) => {
            const detail = s.gymFocus ?? s.cardioKind ?? s.sportName;
            return (
              <li key={s.id} className="card wk-row">
                <div>
                  <strong>{TYPE_LABEL[s.type]}</strong>
                  {detail && <span className="muted"> · {detail}</span>}
                  <div className="muted">{s.date}</div>
                </div>
                <span>{describe(s)}</span>
                <span className="wk-actions">
                  <button aria-label={`Edit ${TYPE_LABEL[s.type]} session ${s.date}`} onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${TYPE_LABEL[s.type]} session ${s.date}`}
                    disabled={del.isPending}
                    onClick={() => {
                      if (!window.confirm(`Delete the ${TYPE_LABEL[s.type]} session on ${s.date}?`)) return;
                      del.mutate(s.id, { onError: (err) => toast.showError(err, 'Could not delete session') });
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {logging && <SessionForm today={today} onClose={() => setLogging(false)} />}
      {editing && <SessionForm today={today} session={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function WorkoutsPage() {
  return (
    <SettingsGate>
      <WorkoutsPageContent />
    </SettingsGate>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import {
  CATEGORY_META, PROJECT_KINDS, PROJECT_KIND_CATEGORY, addDays, isoWeekday, localDateOf, weekStartOf, type ProjectWithProgress,
} from '@life-tracker/shared';
import { useCourses } from '../../../api/hooks/courses';
import { useGoals } from '../../../api/hooks/goals';
import { usePreferences } from '../../../api/hooks/preferences';
import { useDeleteProject, useProjects } from '../../../api/hooks/projects';
import { useTimezone } from '../../../api/hooks/settings';
import { ProgressBar } from '../../../components/ProgressBar';
import { SettingsGate } from '../../../components/SettingsGate';
import { useToast } from '../../../components/Toast';
import { hours } from '../format';
import { KIND_LABEL, PRIORITY_LABEL, ProjectForm } from './ProjectForm';
import { WeeklyGoals } from './WeeklyGoals';
import '../areas.css';
import './thisWeek.css';

function ProjectCard({ p, onEdit, onDelete }: { p: ProjectWithProgress; onEdit: () => void; onDelete: () => void }) {
  const color = CATEGORY_META[PROJECT_KIND_CATEGORY[p.kind]].color;
  return (
    <li className="card" aria-label={p.title}>
      <div className="area-row">
        <strong className="grow">{p.title}</strong>
        <div className="area-actions">
          <button onClick={onEdit} aria-label={`Edit ${p.title}`}>
            Edit
          </button>
          <button onClick={onDelete} aria-label={`Delete ${p.title}`}>
            Delete
          </button>
        </div>
      </div>
      <div className="tw-tags">
        <span className="tw-tag">{hours(p.weeklyMinutes)} h/week</span>
        <span className="tw-tag">{p.weekStart === null ? 'Every week' : 'This week only'}</span>
        {p.priority !== 2 && <span className="tw-tag">{PRIORITY_LABEL[p.priority]} priority</span>}
      </div>
      <ProgressBar value={p.doneMinutes} max={p.weeklyMinutes} color={color} label={`${p.title} progress`} />
      <div className="area-row muted">
        <span>
          Done {hours(p.doneMinutes)} / {hours(p.weeklyMinutes)} h
        </span>
        <span>Planned {hours(p.plannedMinutes)} h</span>
      </div>
    </li>
  );
}

/** Wanted hours this week against a rough room estimate (daily max of planned work × days left). Relax is listed apart. */
function Totals({ projects, weekStart, thisWeek, today }: { projects: ProjectWithProgress[]; weekStart: string; thisWeek: string; today: string }) {
  const prefs = usePreferences().data;
  const goals = useGoals().data;
  const courses = useCourses().data ?? [];
  if (!prefs) return null;
  const sum = (ps: ProjectWithProgress[]) => ps.reduce((n, p) => n + p.weeklyMinutes, 0);
  const relax = sum(projects.filter((p) => p.kind === 'relax'));
  const work = sum(projects.filter((p) => p.kind !== 'relax'));
  const study = courses.reduce((n, c) => n + c.weeklyGoalMinutes, 0);
  const startup = goals?.startupMinutes ?? 0;
  const wanted = work + study + startup;
  const days = weekStart === thisWeek ? 8 - isoWeekday(today) : 7;
  const room = prefs.maxPlannedMinutesPerDay * days;
  return (
    <div className="card tw-totals" aria-label="Hours this week">
      <div>
        Wanted: <strong>{hours(wanted)} h</strong>{' '}
        <span className="muted">
          (projects {hours(work)} h, courses {hours(study)} h, startup {hours(startup)} h)
        </span>
        {relax > 0 && <span className="muted"> + {hours(relax)} h relax</span>}
      </div>
      <div className="muted">
        Room: about {hours(room)} h of planned work ({hours(prefs.maxPlannedMinutesPerDay)} h a day × {days} day{days === 1 ? '' : 's'})
      </div>
      {wanted > room && <p className="tw-warn">That is more than fits. Lower priorities may not all get planned.</p>}
    </div>
  );
}

function ThisWeekContent() {
  const tz = useTimezone();
  const today = localDateOf(new Date(), tz);
  const thisWeek = weekStartOf(new Date(), tz);
  const [picked, setPicked] = useState<string | null>(null);
  const weekStart = picked ?? thisWeek;
  const projects = useProjects(weekStart);
  const remove = useDeleteProject();
  const toast = useToast();
  const [editing, setEditing] = useState<ProjectWithProgress | 'new' | null>(null);

  async function onDelete(p: ProjectWithProgress) {
    if (!window.confirm(`Delete ${p.title}? Blocks already on your calendar stay.`)) return;
    try {
      await remove.mutateAsync(p.id);
    } catch (err) {
      toast.showError(err, 'Could not delete project');
    }
  }

  const list = projects.data ?? [];
  return (
    <div>
      <div className="area-head">
        <h1>This week</h1>
        <Link to={`/week?week=${weekStart}`} className="tw-plan">
          Plan this week
        </Link>
      </div>
      <div className="tw-switcher">
        <button type="button" aria-label="Previous week" onClick={() => setPicked(addDays(weekStart, -7))}>
          ◀
        </button>
        <div className="tw-title">
          <strong>{weekStart === thisWeek ? 'This week' : `Week of ${weekStart}`}</strong>
          {weekStart === thisWeek && <div className="muted">{`Week of ${weekStart}`}</div>}
        </div>
        <button type="button" aria-label="Next week" onClick={() => setPicked(addDays(weekStart, 7))}>
          ▶
        </button>
        {weekStart !== thisWeek && (
          <button type="button" onClick={() => setPicked(null)}>
            This week
          </button>
        )}
      </div>

      <section className="section">
        <div className="area-head">
          <h2>What do you want to do this week?</h2>
          <button className="primary" onClick={() => setEditing('new')}>
            Add project
          </button>
        </div>
        {projects.isLoading && <p className="muted">Loading…</p>}
        {projects.isError && (
          <p className="error" role="alert">
            Could not load projects.
          </p>
        )}
        {projects.data?.length === 0 && (
          <p className="muted">Nothing yet. Add classes to study for, startup work, fun projects or time to relax.</p>
        )}
        {PROJECT_KINDS.map((kind) => {
          const ofKind = list.filter((p) => p.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <div key={kind} className="tw-group">
              <h3>{KIND_LABEL[kind]}</h3>
              <ul className="area-list" aria-label={KIND_LABEL[kind]}>
                {ofKind.map((p) => (
                  <ProjectCard key={p.id} p={p} onEdit={() => setEditing(p)} onDelete={() => onDelete(p)} />
                ))}
              </ul>
            </div>
          );
        })}
        {projects.data && <Totals projects={list} weekStart={weekStart} thisWeek={thisWeek} today={today} />}
      </section>

      <section className="section">
        <h2>Startup and free evenings</h2>
        <WeeklyGoals />
      </section>

      <p className="muted">
        When this looks right, <Link to={`/week?week=${weekStart}`}>plan the week</Link> from the Week tab.
      </p>
      {editing && (
        <ProjectForm project={editing === 'new' ? null : editing} weekStart={weekStart} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export function ThisWeekPage() {
  return (
    <SettingsGate>
      <ThisWeekContent />
    </SettingsGate>
  );
}

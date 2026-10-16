import { useState, type FormEvent } from 'react';
import { localDateOf, type FixedEvent, type Preferences } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useCourses } from '../../../api/hooks/courses';
import { usePatchPreferences, usePreferences } from '../../../api/hooks/preferences';
import { useFixedEvents } from '../../../api/hooks/schedule';
import { useTimezone } from '../../../api/hooks/settings';
import { BufferFields, subErrors } from '../../../components/planning';
import { SettingsGate } from '../../../components/SettingsGate';
import { useToast } from '../../../components/Toast';
import { hours } from '../format';
import { ClassGrid } from './ClassGrid';
import { FixedEventForm } from './FixedEventForm';
import { weeklyMinutes } from './grid';
import '../areas.css';
import './classes.css';

function DefaultBufferCard({ prefs }: { prefs: Preferences }) {
  const patch = usePatchPreferences();
  const toast = useToast();
  const [value, setValue] = useState(prefs.classBuffer);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await patch.mutateAsync({ classBuffer: value });
      toast.show('Default class buffer saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(subErrors(err.fields, 'classBuffer'));
      toast.showError(err, 'Could not save the class buffer');
    }
  }

  return (
    <form className="card section" onSubmit={onSubmit} noValidate>
      <h2>Default class buffer</h2>
      <p className="muted">The planner keeps this time free around every class, unless a class sets its own.</p>
      <BufferFields label="Class buffer" value={value} onChange={setValue} errors={errors} />
      <button className="primary" type="submit" disabled={patch.isPending}>
        Save default buffer
      </button>
    </form>
  );
}

type Editing = { event: FixedEvent | null } | null;

function ClassesPageContent() {
  const tz = useTimezone();
  const events = useFixedEvents();
  const courses = useCourses();
  const prefs = usePreferences();
  const [editing, setEditing] = useState<Editing>(null);
  const [showEnded, setShowEnded] = useState(false);

  if (!events.data || !courses.data || !prefs.data) {
    const failed = events.isError || courses.isError || prefs.isError;
    return (
      <div>
        <h1>Classes</h1>
        <p className="muted">{failed ? 'Could not load your schedule.' : 'Loading…'}</p>
      </div>
    );
  }

  const today = localDateOf(new Date(), tz);
  const ended = events.data.filter((ev) => ev.validTo < today);
  const shown = showEnded ? events.data : events.data.filter((ev) => ev.validTo >= today);
  // The weekly totals count what is running now.
  const current = events.data.filter((ev) => ev.active && ev.validFrom <= today && ev.validTo >= today);
  const classMin = weeklyMinutes(current.filter((ev) => ev.kind === 'class'));
  const workMin = weeklyMinutes(current.filter((ev) => ev.kind === 'work'));

  return (
    <div>
      <div className="area-head">
        <h1>Classes</h1>
        <button className="primary" type="button" onClick={() => setEditing({ event: null })}>
          Add class or shift
        </button>
      </div>
      <p className="class-summary">
        <strong>{hours(classMin)} h</strong> of class per week
        {workMin > 0 && (
          <>
            {' '}· <strong>{hours(workMin)} h</strong> of work
          </>
        )}
      </p>
      <div className="card section">
        {shown.length === 0 && <p className="muted">No classes or shifts yet. Add your timetable to see your week here.</p>}
        <ClassGrid events={shown} courses={courses.data} prefs={prefs.data} onEdit={(event) => setEditing({ event })} />
        <div className="class-legend muted">
          <span><span className="class-legend-swatch" aria-hidden /> Class or shift</span>
          <span><span className="class-legend-swatch is-buffer" aria-hidden /> Buffer kept free</span>
          {ended.length > 0 && (
            <button type="button" className="class-link" onClick={() => setShowEnded((v) => !v)}>
              {showEnded ? 'Hide ended' : `Show ended (${ended.length})`}
            </button>
          )}
        </div>
      </div>
      <DefaultBufferCard prefs={prefs.data} />
      {editing && (
        <FixedEventForm event={editing.event} courses={courses.data} prefs={prefs.data} tz={tz} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

export function ClassesPage() {
  return (
    <SettingsGate>
      <ClassesPageContent />
    </SettingsGate>
  );
}

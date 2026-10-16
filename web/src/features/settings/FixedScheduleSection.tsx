import { useEffect, useState, type FormEvent } from 'react';
import { addDays, localDateOf, type FixedEvent } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { useCourses } from '../../api/hooks/courses';
import { useTimezone } from '../../api/hooks/settings';
import { useDeleteFixedEvent, useFixedEvents, useSaveFixedEvent } from '../../api/hooks/schedule';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';

import { WEEKDAYS } from '../../components/planning';

interface Draft {
  id?: string;
  kind: 'class' | 'work';
  title: string;
  courseId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
}

function emptyDraft(tz: string): Draft {
  const today = localDateOf(new Date(), tz);
  return { kind: 'class', title: '', courseId: '', weekday: 1, startTime: '09:00', endTime: '10:00', validFrom: today, validTo: addDays(today, 120) };
}

export function FixedScheduleSection() {
  const events = useFixedEvents();
  const courses = useCourses();
  const save = useSaveFixedEvent();
  const del = useDeleteFixedEvent();
  const toast = useToast();
  const tz = useTimezone();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(tz));
  // Settings load after first render: re-derive the default dates for the configured timezone while the form is untouched.
  useEffect(() => {
    setDraft((d) => (d.id === undefined && d.title === '' ? { ...d, validFrom: emptyDraft(tz).validFrom, validTo: emptyDraft(tz).validTo } : d));
  }, [tz]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const courseName = (id: string | null) => courses.data?.find((c) => c.id === id)?.name ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    if (draft.kind === 'class' && !draft.courseId) {
      setErrors({ courseId: 'Course is required for classes' });
      return;
    }
    const { id, courseId, ...rest } = draft;
    try {
      await save.mutateAsync({ id, ...rest, courseId: draft.kind === 'class' ? courseId : null, active: true } as Parameters<typeof save.mutateAsync>[0]);
      setDraft(emptyDraft(tz));
      toast.show(id ? 'Fixed event updated' : 'Fixed event added');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save fixed event');
    }
  }

  async function remove(ev: FixedEvent) {
    if (!window.confirm(`Remove all future occurrences of ${ev.title}? Past, reviewed ones are kept.`)) return;
    try {
      await del.mutateAsync(ev.id);
      toast.show('Fixed event removed');
    } catch (err) {
      toast.showError(err, 'Could not remove fixed event');
    }
  }

  function edit(ev: FixedEvent) {
    setErrors({});
    setDraft({ id: ev.id, kind: ev.kind, title: ev.title, courseId: ev.courseId ?? '', weekday: ev.weekday, startTime: ev.startTime, endTime: ev.endTime, validFrom: ev.validFrom, validTo: ev.validTo });
  }

  if (!events.data) return <p className="muted">Loading fixed schedule…</p>;

  return (
    <div>
      {events.data.length === 0 && <p className="muted">No classes or shifts yet.</p>}
      {WEEKDAYS.map((name, i) => {
        const day = events.data.filter((ev) => ev.weekday === i + 1).sort((a, b) => a.startTime.localeCompare(b.startTime));
        if (day.length === 0) return null;
        return (
          <div key={name} className="schedule-day">
            <h3>{name}</h3>
            <ul className="schedule-list">
              {day.map((ev) => (
                <li key={ev.id}>
                  <span>
                    <strong>{ev.title}</strong> · {ev.kind}
                    {ev.courseId && courseName(ev.courseId) ? ` · ${courseName(ev.courseId)}` : ''} · {ev.startTime}–{ev.endTime}
                    <span className="muted"> · {ev.validFrom} to {ev.validTo}</span>
                  </span>
                  <button type="button" onClick={() => edit(ev)} aria-label={`Edit ${ev.title}`}>Edit</button>
                  <button type="button" onClick={() => remove(ev)} aria-label={`Delete ${ev.title}`}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <form onSubmit={onSubmit} noValidate>
        <h3>{draft.id ? 'Edit fixed event' : 'Add fixed event'}</h3>
        <Field label="Kind" error={errors.kind}>
          <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
            <option value="class">Class</option>
            <option value="work">Work</option>
          </select>
        </Field>
        <Field label="Title" error={errors.title}>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        {draft.kind === 'class' && (
          <Field label="Course" error={errors.courseId}>
            <select value={draft.courseId} onChange={(e) => set({ courseId: e.target.value })}>
              <option value="">Select a course…</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Weekday" error={errors.weekday}>
          <select value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((n, i) => (
              <option key={n} value={i + 1}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Start" error={errors.startTime}>
          <input type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="End" error={errors.endTime}>
          <input type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Valid from" error={errors.validFrom}>
          <input type="date" value={draft.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        </Field>
        <Field label="Valid to" error={errors.validTo}>
          <input type="date" value={draft.validTo} onChange={(e) => set({ validTo: e.target.value })} />
        </Field>
        <button className="primary" type="submit" disabled={save.isPending}>
          {draft.id ? 'Save changes' : 'Add to schedule'}
        </button>
        {draft.id && (
          <button type="button" onClick={() => { setDraft(emptyDraft(tz)); setErrors({}); }}>
            Cancel edit
          </button>
        )}
      </form>
    </div>
  );
}

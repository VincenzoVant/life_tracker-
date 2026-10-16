import { useState, type FormEvent } from 'react';
import { addDays, localDateOf, type Course, type FixedEvent, type Preferences } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useCreateCourse } from '../../../api/hooks/courses';
import { useDeleteFixedEvent, useSaveFixedEvent } from '../../../api/hooks/schedule';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { DayChips, WEEKDAYS } from '../../../components/planning';
import { useToast } from '../../../components/Toast';

type Side = 'before' | 'after';

interface Draft {
  kind: 'class' | 'work';
  title: string;
  courseId: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  /** Minutes as typed; ignored while `useDefault[side]` is on. */
  buffer: Record<Side, string>;
  useDefault: Record<Side, boolean>;
}

function toDraft(ev: FixedEvent | null, tz: string, weekday: number): Draft {
  if (!ev) {
    const today = localDateOf(new Date(), tz);
    return {
      kind: 'class', title: '', courseId: '', weekdays: [weekday], startTime: '09:00', endTime: '10:00',
      validFrom: today, validTo: addDays(today, 120), buffer: { before: '', after: '' }, useDefault: { before: true, after: true },
    };
  }
  return {
    kind: ev.kind, title: ev.title, courseId: ev.courseId ?? '', weekdays: [ev.weekday], startTime: ev.startTime,
    endTime: ev.endTime, validFrom: ev.validFrom, validTo: ev.validTo,
    buffer: { before: ev.bufferBefore === null ? '' : String(ev.bufferBefore), after: ev.bufferAfter === null ? '' : String(ev.bufferAfter) },
    useDefault: { before: ev.bufferBefore === null, after: ev.bufferAfter === null },
  };
}

const SIDE_KEY = { before: 'bufferBefore', after: 'bufferAfter' } as const;

interface NewCourse {
  name: string;
  color: string;
  hours: string;
}
const EMPTY_COURSE: NewCourse = { name: '', color: '#3f51b5', hours: '' };

/** Add (one event per picked weekday) or edit a class or work shift, including its buffers. */
export function FixedEventForm({
  event, courses, prefs, tz, onClose,
}: { event: FixedEvent | null; courses: Course[]; prefs: Preferences; tz: string; onClose: () => void }) {
  const save = useSaveFixedEvent();
  const del = useDeleteFixedEvent();
  const createCourse = useCreateCourse();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(event, tz, 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newCourse, setNewCourse] = useState<NewCourse | null>(courses.length === 0 ? { ...EMPTY_COURSE } : null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const defaults = draft.kind === 'class' ? prefs.classBuffer : { before: prefs.bufferMinutes, after: prefs.bufferMinutes };

  function pickCourse(id: string) {
    const name = courses.find((c) => c.id === id)?.name;
    set({ courseId: id, ...(draft.title.trim() === '' && name ? { title: name } : {}) });
  }

  async function addCourse() {
    if (!newCourse || !newCourse.name.trim()) return setErrors((e) => ({ ...e, newCourse: 'Name is required' }));
    try {
      const hours = newCourse.hours.trim() === '' ? 0 : Number(newCourse.hours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 100) return setErrors((e) => ({ ...e, newCourseHours: 'Enter 0 to 100 hours' }));
      const c = await createCourse.mutateAsync({ name: newCourse.name.trim(), color: newCourse.color, weeklyGoalMinutes: Math.round(hours * 60) });
      setNewCourse(null);
      setErrors((e) => ({ ...e, newCourse: '', newCourseHours: '', courseId: '' }));
      set({ courseId: c.id, ...(draft.title.trim() === '' ? { title: c.name } : {}) });
      toast.show('Course added');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors((e) => ({ ...e, newCourse: Object.values(err.fields!)[0]! }));
      toast.showError(err, 'Could not add course');
    }
  }

  function bufferValue(side: Side): number | null | undefined {
    if (draft.useDefault[side]) return null;
    const text = draft.buffer[side].trim();
    const n = Number(text);
    return text !== '' && Number.isInteger(n) && n >= 0 && n <= 240 ? n : undefined;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (draft.kind === 'class' && !draft.courseId) errs.courseId = 'Course is required for classes';
    if (draft.weekdays.length === 0) errs.weekday = 'Pick at least one day';
    const before = bufferValue('before');
    const after = bufferValue('after');
    if (before === undefined) errs.bufferBefore = 'Enter 0 to 240 minutes';
    if (after === undefined) errs.bufferAfter = 'Enter 0 to 240 minutes';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body = {
      kind: draft.kind, title: draft.title, courseId: draft.kind === 'class' ? draft.courseId : null,
      startTime: draft.startTime, endTime: draft.endTime, validFrom: draft.validFrom, validTo: draft.validTo,
      active: true, bufferBefore: before ?? null, bufferAfter: after ?? null,
    };
    let done: number[] = [];
    try {
      if (event) await save.mutateAsync({ id: event.id, ...body, weekday: draft.weekdays[0]! as FixedEvent['weekday'] });
      else {
        for (const weekday of draft.weekdays) {
          await save.mutateAsync({ ...body, weekday: weekday as FixedEvent['weekday'] });
          done = [...done, weekday];
        }
      }
      toast.show(event ? 'Saved' : draft.weekdays.length > 1 ? `Added on ${draft.weekdays.length} days` : 'Added to schedule');
      onClose();
    } catch (err) {
      // Days that were already created stay out of a retry.
      if (done.length) set({ weekdays: draft.weekdays.filter((d) => !done.includes(d)) });
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save');
    }
  }

  async function remove() {
    if (!event || !window.confirm(`Remove all future occurrences of ${event.title}? Past, reviewed ones are kept.`)) return;
    try {
      await del.mutateAsync(event.id);
      toast.show('Removed from schedule');
      onClose();
    } catch (err) {
      toast.showError(err, 'Could not remove');
    }
  }

  const bufferField = (side: Side) => (
    <div className="class-buffer">
      <Field label={`Buffer ${side} (min)`} error={errors[SIDE_KEY[side]]}>
        <input
          type="number" inputMode="numeric" min={0} max={240} step={5}
          value={draft.useDefault[side] ? String(defaults[side]) : draft.buffer[side]}
          disabled={draft.useDefault[side]}
          onChange={(e) => set({ buffer: { ...draft.buffer, [side]: e.target.value } })}
        />
      </Field>
      <label className="class-check">
        <input
          type="checkbox"
          checked={draft.useDefault[side]}
          onChange={(e) => set({
            useDefault: { ...draft.useDefault, [side]: e.target.checked },
            ...(!e.target.checked && draft.buffer[side] === '' ? { buffer: { ...draft.buffer, [side]: String(defaults[side]) } } : {}),
          })}
        />
        Use default {side}
      </label>
    </div>
  );

  const noun = draft.kind === 'class' ? 'class' : 'shift';
  return (
    <Modal title={event ? `Edit ${noun}` : `Add ${noun}`} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Kind" error={errors.kind}>
          <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'] })}>
            <option value="class">Class</option>
            <option value="work">Work</option>
          </select>
        </Field>
        {draft.kind === 'class' && (
          <>
            <Field label="Course" error={errors.courseId}>
              <select value={draft.courseId} onChange={(e) => pickCourse(e.target.value)}>
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            {newCourse ? (
              <div className="class-newcourse">
                <Field label="New course name" error={errors.newCourse}>
                  <input value={newCourse.name} onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })} />
                </Field>
                <Field label="New course colour">
                  <input type="color" value={newCourse.color} onChange={(e) => setNewCourse({ ...newCourse, color: e.target.value })} />
                </Field>
                <Field label="Study hours per week (outside class)" error={errors.newCourseHours}>
                  <input type="number" inputMode="decimal" min={0} step={0.5} value={newCourse.hours} onChange={(e) => setNewCourse({ ...newCourse, hours: e.target.value })} />
                </Field>
                <p className="muted">Leave empty for none; the planner only schedules study for courses with hours. You can change this in Studies.</p>
                <div className="area-actions">
                  <button type="button" onClick={addCourse} disabled={createCourse.isPending}>Create course</button>
                  {courses.length > 0 && <button type="button" onClick={() => setNewCourse(null)}>Cancel</button>}
                </div>
              </div>
            ) : (
              <button type="button" className="class-link" onClick={() => setNewCourse({ ...EMPTY_COURSE })}>
                New course
              </button>
            )}
          </>
        )}
        <Field label="Title" error={errors.title}>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={draft.kind === 'class' ? 'Lecture' : 'Shift'} />
        </Field>
        {event ? (
          <Field label="Weekday" error={errors.weekday}>
            <select value={draft.weekdays[0]} onChange={(e) => set({ weekdays: [Number(e.target.value)] })}>
              {WEEKDAYS.map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="field">
            <span className="class-label">Days</span>
            <DayChips label="Days" days={draft.weekdays} onChange={(weekdays) => set({ weekdays })} error={errors.weekday} />
          </div>
        )}
        <div className="class-pair">
          <Field label="Start" error={errors.startTime}>
            <input type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          </Field>
          <Field label="End" error={errors.endTime}>
            <input type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} />
          </Field>
        </div>
        <div className="class-pair">
          <Field label="Valid from" error={errors.validFrom}>
            <input type="date" value={draft.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
          </Field>
          <Field label="Valid to" error={errors.validTo}>
            <input type="date" value={draft.validTo} onChange={(e) => set({ validTo: e.target.value })} />
          </Field>
        </div>
        <p className="muted class-hint">Free time the planner keeps around this {noun}.</p>
        <div className="class-pair">
          {bufferField('before')}
          {bufferField('after')}
        </div>
        <div className="area-actions class-actions">
          <button className="primary" type="submit" disabled={save.isPending}>
            {event ? 'Save changes' : 'Add to schedule'}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
          {event && (
            <button type="button" className="class-delete" onClick={remove} disabled={del.isPending}>
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

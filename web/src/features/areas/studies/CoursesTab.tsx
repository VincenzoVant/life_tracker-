import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Course } from '@life-tracker/shared';
import { useArchiveCourse, useCourses, useCreateCourse, useUpdateCourse } from '../../../api/hooks/courses';
import { useWeekProgress } from '../../../api/hooks/progress';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { ProgressBar } from '../../../components/ProgressBar';
import { useToast } from '../../../components/Toast';
import { hours } from '../format';

function CourseForm({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const toast = useToast();
  const [name, setName] = useState(course?.name ?? '');
  const [color, setColor] = useState(course?.color ?? '#3f51b5');
  const [hrs, setHrs] = useState(String(course ? course.weeklyGoalMinutes / 60 : 6));
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const h = Number(hrs);
    if (!name.trim()) return setError('Name is required');
    if (!Number.isFinite(h) || h < 0 || h > 100) return setError('Weekly hours must be between 0 and 100');
    const body = { name: name.trim(), color, weeklyGoalMinutes: Math.round(h * 60) };
    try {
      if (course) await update.mutateAsync({ id: course.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      toast.showError(err, 'Could not save course');
    }
  }

  return (
    <Modal title={course ? 'Edit course' : 'Add course'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </Field>
        <Field label="Weekly hours" error={error}>
          <input type="number" min="0" step="0.5" value={hrs} onChange={(e) => setHrs(e.target.value)} />
        </Field>
        <div className="area-actions">
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CoursesTab({ weekStart }: { weekStart: string }) {
  const courses = useCourses();
  const progress = useWeekProgress(weekStart);
  const archive = useArchiveCourse();
  const toast = useToast();
  const [editing, setEditing] = useState<Course | 'new' | null>(null);

  async function onArchive(c: Course) {
    if (!window.confirm(`Archive ${c.name}? Past study time is kept.`)) return;
    try {
      await archive.mutateAsync(c.id);
    } catch (err) {
      toast.showError(err, 'Could not archive course');
    }
  }

  return (
    <section>
      <div className="area-row study-tab-head">
        <p className="muted grow">What you study, and how many hours a week each course gets.</p>
        <button className="primary" onClick={() => setEditing('new')}>
          Add course
        </button>
      </div>
      {courses.isLoading && <p className="muted">Loading…</p>}
      {courses.data?.length === 0 && <p className="muted">No courses yet. Add one to start planning study time.</p>}
      <ul className="area-list">
        {courses.data?.map((c) => {
          const m = progress.data?.study.find((s) => s.courseId === c.id);
          const actual = m?.actual ?? 0;
          const goal = m?.goal ?? c.weeklyGoalMinutes;
          return (
            <li key={c.id} className="card" aria-label={c.name}>
              <div className="area-row">
                <span className="swatch" style={{ '--swatch': c.color } as CSSProperties} />
                <strong className="grow">{c.name}</strong>
                <span className="study-goal">{hours(c.weeklyGoalMinutes)} h / week</span>
                <div className="area-actions">
                  <button onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                    Edit
                  </button>
                  <button onClick={() => onArchive(c)} aria-label={`Archive ${c.name}`}>
                    Archive
                  </button>
                </div>
              </div>
              <ProgressBar value={actual} max={goal} color={c.color} label={`${c.name} progress`} />
              <div className="area-row muted">
                <span>
                  {hours(actual)} / {hours(goal)} h
                </span>
                <span>Planned {hours(m?.planned ?? 0)} h</span>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <CourseForm course={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

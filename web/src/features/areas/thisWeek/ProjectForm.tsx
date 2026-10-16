import { useState, type FormEvent } from 'react';
import { PROJECT_KINDS, type Project, type ProjectInput, type ProjectKind, type ProjectPriority } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useCourses } from '../../../api/hooks/courses';
import { useCreateProject, useUpdateProject } from '../../../api/hooks/projects';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { TimeWindowEditor, subErrors, type TimeWindow } from '../../../components/planning';
import { useToast } from '../../../components/Toast';

export const KIND_LABEL: Record<ProjectKind, string> = { study: 'Study', startup: 'Startup', fun: 'Fun', relax: 'Relax', other: 'Other' };
export const PRIORITY_LABEL: Record<ProjectPriority, string> = { 1: 'High', 2: 'Normal', 3: 'Low' };

/** Add/edit a project. `weekStart` is the week shown, used for "only this week". */
export function ProjectForm({ project, weekStart, onClose }: { project: Project | null; weekStart: string; onClose: () => void }) {
  const create = useCreateProject();
  const update = useUpdateProject();
  const courses = useCourses();
  const toast = useToast();
  const [title, setTitle] = useState(project?.title ?? '');
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'study');
  const [courseId, setCourseId] = useState(project?.courseId ?? '');
  const [hrs, setHrs] = useState(String(project ? project.weeklyMinutes / 60 : 2));
  const [everyWeek, setEveryWeek] = useState(project ? project.weekStart === null : true);
  const [windows, setWindows] = useState<TimeWindow[]>(project?.windows ?? []);
  const [blockMin, setBlockMin] = useState(String(project?.blockMin ?? 60));
  const [blockMax, setBlockMax] = useState(String(project?.blockMax ?? 120));
  const [priority, setPriority] = useState<ProjectPriority>(project?.priority ?? 2);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const h = Number(hrs);
    if (!title.trim()) return setErrors({ title: 'Title is required' });
    if (hrs.trim() === '' || !Number.isFinite(h) || h <= 0) return setErrors({ weeklyMinutes: 'Enter the hours you want this week' });
    const body: ProjectInput = {
      title: title.trim(),
      kind,
      courseId: kind === 'study' ? courseId || null : null,
      // The planner works in 15-minute steps.
      weeklyMinutes: Math.max(15, Math.round(h * 4) * 15),
      weekStart: everyWeek ? null : (project?.weekStart ?? weekStart),
      windows,
      blockMin: Number(blockMin),
      blockMax: Number(blockMax),
      priority,
    };
    setErrors({});
    try {
      if (project) await update.mutateAsync({ id: project.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save project');
    }
  }

  return (
    <Modal title={project ? 'Edit project' : 'Add project'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Title" error={errors.title}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm prep, side project, sauna…" />
        </Field>
        <Field label="Kind" error={errors.kind}>
          <select value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)}>
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {kind === 'study' && (
          <Field label="Course" error={errors.courseId}>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Pick a course</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Hours this week" error={errors.weeklyMinutes}>
          <input type="number" inputMode="decimal" min="0.25" step="0.25" value={hrs} onChange={(e) => setHrs(e.target.value)} />
        </Field>
        <fieldset className="tw-repeat">
          <legend>Repeat</legend>
          <label>
            <input type="radio" name="repeat" checked={everyWeek} onChange={() => setEveryWeek(true)} /> Every week
          </label>
          <label>
            <input type="radio" name="repeat" checked={!everyWeek} onChange={() => setEveryWeek(false)} /> Only this week
          </label>
        </fieldset>
        <TimeWindowEditor
          label="Preferred time"
          windows={windows}
          onChange={setWindows}
          errors={subErrors(errors, 'windows')}
          emptyText="Any time the planner finds room."
        />
        <div className="buffer-fields">
          <Field label="Shortest block (min)" error={errors.blockMin}>
            <input type="number" inputMode="numeric" min={15} step={15} value={blockMin} onChange={(e) => setBlockMin(e.target.value)} />
          </Field>
          <Field label="Longest block (min)" error={errors.blockMax}>
            <input type="number" inputMode="numeric" min={15} step={15} value={blockMax} onChange={(e) => setBlockMax(e.target.value)} />
          </Field>
        </div>
        <Field label="Priority" error={errors.priority}>
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value) as ProjectPriority)}>
            {([1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <div className="area-actions">
          <button type="submit" className="primary" disabled={create.isPending || update.isPending}>
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

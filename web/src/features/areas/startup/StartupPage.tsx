import { useState, type FormEvent } from 'react';
import { TASK_STATUSES, type Milestone, type StartupTask, type TaskStatus } from '@life-tracker/shared';
import { useWeekProgress } from '../../../api/hooks/progress';
import { useTimezone } from '../../../api/hooks/settings';
import {
  useCreateMilestone,
  useCreateTask,
  useMilestones,
  useReorderTasks,
  useStartupTasks,
  useUpdateMilestone,
  useUpdateTask,
} from '../../../api/hooks/startup';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { ProgressBar } from '../../../components/ProgressBar';
import { useToast } from '../../../components/Toast';
import { currentWeek, hours } from '../format';
import '../areas.css';

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };

function TaskForm({ task, milestones, onClose }: { task: StartupTask | null; milestones: Milestone[]; onClose: () => void }) {
  const create = useCreateTask();
  const update = useUpdateTask();
  const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? '');
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId ?? '');
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Title is required');
    const body = { title: title.trim(), milestoneId: milestoneId || null };
    try {
      if (task) await update.mutateAsync({ id: task.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      toast.showError(err, 'Could not save task');
    }
  }

  return (
    <Modal title={task ? 'Edit task' : 'Add task'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Title" error={error}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Milestone">
          <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
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

function MilestoneForm({ milestone, onClose }: { milestone: Milestone | null; onClose: () => void }) {
  const create = useCreateMilestone();
  const update = useUpdateMilestone();
  const toast = useToast();
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [targetDate, setTargetDate] = useState(milestone?.targetDate ?? '');
  const [done, setDone] = useState(!!milestone?.doneAt);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Title is required');
    const body = { title: title.trim(), targetDate: targetDate || null, done };
    try {
      if (milestone) await update.mutateAsync({ id: milestone.id, ...body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      toast.showError(err, 'Could not save milestone');
    }
  }

  return (
    <Modal title={milestone ? 'Edit milestone' : 'Add milestone'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Title" error={error}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Target date">
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        <Field label="Done">
          <input type="checkbox" style={{ width: 'auto' }} checked={done} onChange={(e) => setDone(e.target.checked)} />
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

export function StartupPage() {
  const tz = useTimezone();
  const { weekStart } = currentWeek(tz);
  const tasksQ = useStartupTasks();
  const milestonesQ = useMilestones();
  const progress = useWeekProgress(weekStart);
  const updateTask = useUpdateTask();
  const reorder = useReorderTasks();
  const toast = useToast();
  const [taskEdit, setTaskEdit] = useState<StartupTask | 'new' | null>(null);
  const [msEdit, setMsEdit] = useState<Milestone | 'new' | null>(null);

  const tasks = [...(tasksQ.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const milestones = [...(milestonesQ.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups: Array<{ id: string | null; title: string; milestone: Milestone | null }> = [
    ...milestones.map((m) => ({ id: m.id, title: m.title, milestone: m })),
    { id: null, title: 'No milestone', milestone: null },
  ];
  const startup = progress.data?.startup;

  const fail = (err: unknown, fallback: string) => toast.showError(err, fallback);

  async function move(task: StartupTask, dir: -1 | 1) {
    const peers = tasks.filter((t) => t.milestoneId === task.milestoneId && t.status === task.status);
    const other = peers[peers.indexOf(task) + dir];
    if (!other) return;
    const ids = tasks.map((t) => t.id);
    const i = ids.indexOf(task.id);
    const j = ids.indexOf(other.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await reorder.mutateAsync(ids);
    } catch (err) {
      fail(err, 'Could not reorder');
    }
  }

  async function setStatus(task: StartupTask, status: TaskStatus) {
    try {
      await updateTask.mutateAsync({ id: task.id, status });
    } catch (err) {
      fail(err, 'Could not update task');
    }
  }

  return (
    <div>
      <div className="area-head">
        <h1>Startup</h1>
        <div className="area-actions">
          <button onClick={() => setMsEdit('new')}>Add milestone</button>
          <button className="primary" onClick={() => setTaskEdit('new')}>
            Add task
          </button>
        </div>
      </div>

      <div className="card section">
        <div className="area-row">
          <strong>This week</strong>
          <span>
            {hours(startup?.actual ?? 0)}
            {startup?.goal != null ? ` / ${hours(startup.goal)}` : ''} h
          </span>
        </div>
        {startup?.goal != null && <ProgressBar value={startup.actual} max={startup.goal} color="#8e24aa" label="Startup hours" />}
      </div>

      {groups.map((g) => {
        const inGroup = tasks.filter((t) => t.milestoneId === g.id);
        if (g.id === null && inGroup.length === 0 && milestones.length > 0) return null;
        return (
          <section key={g.id ?? 'none'} className="section" aria-label={g.title}>
            <div className="area-row">
              <h2 className="grow">{g.title}</h2>
              {g.milestone && (
                <>
                  <span className="muted">
                    {g.milestone.doneAt ? 'Done' : g.milestone.targetDate ? `Due ${g.milestone.targetDate}` : ''}
                  </span>
                  <button onClick={() => setMsEdit(g.milestone)} aria-label={`Edit milestone ${g.title}`}>
                    Edit
                  </button>
                </>
              )}
            </div>
            <div className="task-columns">
              {TASK_STATUSES.map((s) => {
                const col = inGroup.filter((t) => t.status === s);
                return (
                  <div key={s} className="task-col">
                    <h4>{STATUS_LABEL[s]}</h4>
                    {col.map((t) => (
                      <div key={t.id} className="task-item">
                        <span>{t.title}</span>
                        <select
                          aria-label={`Status of ${t.title}`}
                          value={t.status}
                          onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                        >
                          {TASK_STATUSES.map((o) => (
                            <option key={o} value={o}>
                              {STATUS_LABEL[o]}
                            </option>
                          ))}
                        </select>
                        <div className="area-actions">
                          <button onClick={() => move(t, -1)} disabled={col[0] === t} aria-label={`Move ${t.title} up`}>
                            ↑
                          </button>
                          <button onClick={() => move(t, 1)} disabled={col[col.length - 1] === t} aria-label={`Move ${t.title} down`}>
                            ↓
                          </button>
                          <button onClick={() => setTaskEdit(t)} aria-label={`Edit ${t.title}`}>
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {taskEdit && <TaskForm task={taskEdit === 'new' ? null : taskEdit} milestones={milestones} onClose={() => setTaskEdit(null)} />}
      {msEdit && <MilestoneForm milestone={msEdit === 'new' ? null : msEdit} onClose={() => setMsEdit(null)} />}
    </div>
  );
}

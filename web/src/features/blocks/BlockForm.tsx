import {
  CATEGORIES,
  CATEGORY_META,
  addDays,
  localDateOf,
  localTimeOf,
  zonedToUtc,
  type Block,
  type BlockCreateInput,
  type Category,
  type MealSlot,
  type WorkoutType,
} from '@life-tracker/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateBlock, useUpdateBlock } from '../../api/hooks/blocks';
import { useSettings } from '../../api/hooks/settings';
import { Field } from '../../components/Field';
import { CourseField, MealSlotField, StartupTaskField, WorkoutTypeField } from './BlockFields';

export { CourseField, MealSlotField, StartupTaskField, WorkoutTypeField } from './BlockFields';

export interface BlockFormProps {
  initial?: Partial<Block>;
  onDone: () => void;
  /** Replaces the default create call (e.g. adding to a draft plan). Not used when editing. */
  onCreate?: (input: BlockCreateInput) => Promise<unknown>;
}

const FIELD_KEYS = new Set(['category', 'title', 'date', 'start', 'end', 'courseId', 'startupTaskId', 'workoutType', 'mealSlot']);

function defaults(initial: Partial<Block> | undefined, tz: string) {
  const start = initial?.start ? new Date(initial.start) : new Date();
  const end = initial?.end ? new Date(initial.end) : new Date(start.getTime() + 3_600_000);
  return {
    date: localDateOf(start, tz),
    startTime: localTimeOf(start, tz),
    endTime: localTimeOf(end, tz),
  };
}

/** Create (no `initial.id`) or edit (`initial.id`) a block. Times are entered in the configured timezone. */
export function BlockForm(props: BlockFormProps) {
  const settings = useSettings();
  // Wait for settings so the seeded date/time use the configured timezone, not the browser's.
  if (settings.isPending) return <p className="muted">Loading…</p>;
  const tz = settings.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <BlockFormInner {...props} tz={tz} />;
}

function BlockFormInner({ initial, onDone, onCreate, tz }: BlockFormProps & { tz: string }) {
  const create = useCreateBlock();
  const update = useUpdateBlock();
  const d = defaults(initial, tz);

  const [category, setCategory] = useState<Category>(initial?.category ?? 'other');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(d.date);
  const [startTime, setStartTime] = useState(d.startTime);
  const [endTime, setEndTime] = useState(d.endTime);
  const [courseId, setCourseId] = useState(initial?.courseId ?? '');
  const [startupTaskId, setStartupTaskId] = useState(initial?.startupTaskId ?? '');
  const [workoutType, setWorkoutType] = useState<WorkoutType | ''>(initial?.workoutType ?? '');
  const [mealSlot, setMealSlot] = useState<MealSlot | ''>(initial?.mealSlot ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  const pending = create.isPending || update.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(undefined);
    if (!date || !startTime || !endTime) {
      setErrors({
        ...(!date && { date: 'Enter a date' }),
        ...(!startTime && { start: 'Enter a start time' }),
        ...(!endTime && { end: 'Enter an end time' }),
      });
      return;
    }
    const start = zonedToUtc(date, startTime, tz);
    // An end time earlier than the start means the block runs past midnight.
    const end = zonedToUtc(endTime < startTime ? addDays(date, 1) : date, endTime, tz);
    const input: BlockCreateInput = {
      category,
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      courseId: category === 'study' && courseId ? courseId : null,
      startupTaskId: category === 'startup' && startupTaskId ? startupTaskId : null,
      workoutType: category === 'workout' && workoutType ? workoutType : null,
      mealSlot: category === 'meal' && mealSlot ? mealSlot : null,
    };
    try {
      if (initial?.id) await update.mutateAsync({ id: initial.id, ...input });
      else if (onCreate) await onCreate(input);
      else await create.mutateAsync(input);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields ?? {};
        setErrors(fields);
        const unmatched = Object.entries(fields).filter(([k]) => !FIELD_KEYS.has(k));
        if (unmatched.length) setFormError(unmatched.map(([k, m]) => `${k}: ${m}`).join('; '));
        else if (!err.fields) setFormError(err.message);
      } else {
        setFormError('Something went wrong');
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Category" error={errors.category}>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title" error={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Date" error={errors.date}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Start" error={errors.start}>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </Field>
      <Field label="End" error={errors.end}>
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </Field>
      {category === 'study' && <CourseField value={courseId} onChange={setCourseId} error={errors.courseId} />}
      {category === 'startup' && (
        <StartupTaskField value={startupTaskId} onChange={setStartupTaskId} error={errors.startupTaskId} />
      )}
      {category === 'workout' && (
        <WorkoutTypeField value={workoutType} onChange={setWorkoutType} error={errors.workoutType} />
      )}
      {category === 'meal' && <MealSlotField value={mealSlot} onChange={setMealSlot} error={errors.mealSlot} />}
      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={pending}>
          {initial?.id ? 'Save' : 'Add block'}
        </button>
      </div>
    </form>
  );
}

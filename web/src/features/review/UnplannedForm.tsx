import { useState } from 'react';
import { CATEGORIES, CATEGORY_META, MEAL_SLOTS, WORKOUT_TYPES, zonedToUtc, type Category, type MealSlot, type WorkoutType } from '@life-tracker/shared';
import { useCourses } from '../../api/hooks/courses';
import { useTimezone } from '../../api/hooks/settings';
import type { UnplannedEntry } from '../../api/hooks/review';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { emptyWorkoutDraft, toWorkoutDetails, WorkoutDetailsFields, type WorkoutDraft } from './WorkoutDetailsFields';

/** Small self-contained form for an activity that happened without a planned block. */
export function UnplannedForm({ date, onAdd, onClose }: { date: string; onAdd: (entry: UnplannedEntry) => void; onClose: () => void }) {
  const tz = useTimezone();
  const { data: courses = [] } = useCourses();
  const [category, setCategory] = useState<Category>('other');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('13:00');
  const [minutes, setMinutes] = useState('');
  const [courseId, setCourseId] = useState('');
  const [workoutType, setWorkoutType] = useState<WorkoutType>('gym');
  const [mealSlot, setMealSlot] = useState<MealSlot>('lunch');
  const [workout, setWorkout] = useState<WorkoutDraft>(emptyWorkoutDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!start || !end || end <= start) errs.end = 'End must be after start';
    if (minutes && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1)) errs.minutes = 'Must be a whole number of minutes';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const entry: UnplannedEntry = {
      category,
      title: title.trim(),
      start: zonedToUtc(date, start, tz).toISOString(),
      end: zonedToUtc(date, end, tz).toISOString(),
      ...(category === 'study' && courseId ? { courseId } : {}),
      ...(category === 'workout' ? { workoutType } : {}),
      ...(category === 'meal' ? { mealSlot } : {}),
      ...(minutes ? { actualMinutes: Number(minutes) } : {}),
      ...(category === 'workout' ? { workout: toWorkoutDetails(workoutType, workout) } : {}),
    };
    if (entry.workout === undefined) delete entry.workout;
    onAdd(entry);
  };

  return (
    <Modal title="Add unplanned activity" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" error={errors.title}>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Start">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End" error={errors.end}>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Actual minutes (optional)" error={errors.minutes}>
          <input type="number" inputMode="numeric" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        {category === 'study' && (
          <Field label="Course">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">None</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {category === 'workout' && (
          <>
            <Field label="Workout type">
              <select value={workoutType} onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}>
                {WORKOUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <WorkoutDetailsFields workoutType={workoutType} value={workout} onChange={setWorkout} />
          </>
        )}
        {category === 'meal' && (
          <Field label="Meal slot">
            <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value as MealSlot)}>
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="review-actions">
          <button type="submit">Add</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

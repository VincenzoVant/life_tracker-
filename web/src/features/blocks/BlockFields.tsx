import { MEAL_SLOTS, WORKOUT_TYPES, type MealSlot, type WorkoutType } from '@life-tracker/shared';
import { useCourses } from '../../api/hooks/courses';
import { useStartupTasks } from '../../api/hooks/startup';
import { Field } from '../../components/Field';

interface FieldProps<T> {
  value: T;
  onChange: (v: T) => void;
  error?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');

export function CourseField({ value, onChange, error }: FieldProps<string>) {
  const { data = [] } = useCourses();
  return (
    <Field label="Course" error={error}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a course</option>
        {data.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function StartupTaskField({ value, onChange, error }: FieldProps<string>) {
  const { data = [] } = useStartupTasks();
  return (
    <Field label="Startup task" error={error}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No specific task</option>
        {data
          .filter((t) => t.status !== 'done' || t.id === value)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
      </select>
    </Field>
  );
}

export function WorkoutTypeField({ value, onChange, error }: FieldProps<WorkoutType | ''>) {
  return (
    <Field label="Workout type" error={error}>
      <select value={value} onChange={(e) => onChange(e.target.value as WorkoutType | '')}>
        <option value="">Select a type</option>
        {WORKOUT_TYPES.map((t) => (
          <option key={t} value={t}>
            {cap(t)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function MealSlotField({ value, onChange, error }: FieldProps<MealSlot | ''>) {
  return (
    <Field label="Meal slot" error={error}>
      <select value={value} onChange={(e) => onChange(e.target.value as MealSlot | '')}>
        <option value="">Select a slot</option>
        {MEAL_SLOTS.map((s) => (
          <option key={s} value={s}>
            {cap(s)}
          </option>
        ))}
      </select>
    </Field>
  );
}

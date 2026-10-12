import type { WorkoutType, WorkoutDetails } from '@life-tracker/shared';
import { Field } from '../../components/Field';

/** Raw (string) form state for workout details; converted by toWorkoutDetails. */
export interface WorkoutDraft {
  cardioKind: string;
  distanceKm: string;
  gymFocus: string;
  sportName: string;
  intensity: string;
  notes: string;
}

export const emptyWorkoutDraft: WorkoutDraft = { cardioKind: '', distanceKm: '', gymFocus: '', sportName: '', intensity: '', notes: '' };

/** Returns undefined when nothing relevant was entered. */
export function toWorkoutDetails(type: WorkoutType | null | undefined, d: WorkoutDraft): WorkoutDetails | undefined {
  const out: WorkoutDetails = {};
  if (type === 'cardio') {
    if (d.cardioKind.trim()) out.cardioKind = d.cardioKind.trim();
    if (d.distanceKm.trim() && Number(d.distanceKm) > 0) out.distanceKm = Number(d.distanceKm);
  }
  if (type === 'gym' && d.gymFocus.trim()) out.gymFocus = d.gymFocus.trim();
  if (type === 'sport' && d.sportName.trim()) out.sportName = d.sportName.trim();
  if (d.intensity) out.intensity = Number(d.intensity);
  if (d.notes.trim()) out.notes = d.notes.trim();
  return Object.keys(out).length ? out : undefined;
}

export function WorkoutDetailsFields({
  workoutType,
  value,
  onChange,
}: {
  workoutType: WorkoutType | null | undefined;
  value: WorkoutDraft;
  onChange: (next: WorkoutDraft) => void;
}) {
  const set = (patch: Partial<WorkoutDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="review-workout">
      {workoutType === 'cardio' && (
        <>
          <Field label="Kind (run, bike…)">
            <input type="text" value={value.cardioKind} onChange={(e) => set({ cardioKind: e.target.value })} />
          </Field>
          <Field label="Distance (km)">
            <input type="number" inputMode="decimal" min="0" step="0.1" value={value.distanceKm} onChange={(e) => set({ distanceKm: e.target.value })} />
          </Field>
        </>
      )}
      {workoutType === 'gym' && (
        <Field label="Focus">
          <input type="text" value={value.gymFocus} onChange={(e) => set({ gymFocus: e.target.value })} />
        </Field>
      )}
      {workoutType === 'sport' && (
        <Field label="Sport">
          <input type="text" value={value.sportName} onChange={(e) => set({ sportName: e.target.value })} />
        </Field>
      )}
      <Field label="Intensity">
        <select value={value.intensity} onChange={(e) => set({ intensity: e.target.value })}>
          <option value="">–</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <textarea rows={2} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

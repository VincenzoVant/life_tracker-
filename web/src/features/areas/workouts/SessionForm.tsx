import { useState, type FormEvent } from 'react';
import { WORKOUT_TYPES, type SessionInput, type WorkoutSession, type WorkoutType } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useCreateSession, useUpdateSession } from '../../../api/hooks/workouts';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';

export const TYPE_LABEL: Record<WorkoutType, string> = { gym: 'Gym', cardio: 'Cardio', sport: 'Sport' };

/** Log a new session, or edit `session` when given (its type stays fixed). */
export function SessionForm({ today, session, onClose }: { today: string; session?: WorkoutSession; onClose: () => void }) {
  const create = useCreateSession();
  const update = useUpdateSession();
  const [type, setType] = useState<WorkoutType>(session?.type ?? 'gym');
  const [date, setDate] = useState(session?.date ?? today);
  const [duration, setDuration] = useState(session ? String(session.durationMinutes) : '');
  const [intensity, setIntensity] = useState(session?.intensity != null ? String(session.intensity) : '');
  const [gymFocus, setGymFocus] = useState(session?.gymFocus ?? '');
  const [cardioKind, setCardioKind] = useState(session?.cardioKind ?? '');
  const [distance, setDistance] = useState(session?.distanceKm != null ? String(session.distanceKm) : '');
  const [sportName, setSportName] = useState(session?.sportName ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: SessionInput = { type, date, durationMinutes: Number(duration) };
    if (intensity) input.intensity = Number(intensity);
    if (notes.trim()) input.notes = notes.trim();
    if (type === 'gym' && gymFocus.trim()) input.gymFocus = gymFocus.trim();
    if (type === 'cardio') {
      if (cardioKind.trim()) input.cardioKind = cardioKind.trim();
      if (distance) input.distanceKm = Number(distance);
    }
    if (type === 'sport' && sportName.trim()) input.sportName = sportName.trim();
    try {
      if (session) await update.mutateAsync({ id: session.id, ...input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setErrors(err instanceof ApiError ? (err.fields ?? { _form: err.message }) : { _form: 'Could not save' });
    }
  }

  return (
    <Modal title={session ? 'Edit session' : 'Log session'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Type" error={errors.type}>
          <select value={type} disabled={!!session} onChange={(e) => setType(e.target.value as WorkoutType)}>
            {WORKOUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" error={errors.date}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Duration (min)" error={errors.durationMinutes}>
          <input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} required />
        </Field>
        {type === 'gym' && (
          <Field label="Focus" error={errors.gymFocus}>
            <input value={gymFocus} onChange={(e) => setGymFocus(e.target.value)} />
          </Field>
        )}
        {type === 'cardio' && (
          <>
            <Field label="Kind" error={errors.cardioKind}>
              <input value={cardioKind} onChange={(e) => setCardioKind(e.target.value)} />
            </Field>
            <Field label="Distance (km)" error={errors.distanceKm}>
              <input type="number" step="0.01" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} />
            </Field>
          </>
        )}
        {type === 'sport' && (
          <Field label="Sport" error={errors.sportName}>
            <input value={sportName} onChange={(e) => setSportName(e.target.value)} />
          </Field>
        )}
        <Field label="Intensity (1-5)" error={errors.intensity}>
          <input type="number" min={1} max={5} value={intensity} onChange={(e) => setIntensity(e.target.value)} />
        </Field>
        <Field label="Notes" error={errors.notes}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {errors._form && (
          <p className="error" role="alert">
            {errors._form}
          </p>
        )}
        <div className="wk-actions">
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

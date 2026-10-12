import { useState, type FormEvent } from 'react';
import { WORKOUT_TYPES, type SessionInput, type WorkoutType } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useCreateSession } from '../../../api/hooks/workouts';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';

export const TYPE_LABEL: Record<WorkoutType, string> = { gym: 'Gym', cardio: 'Cardio', sport: 'Sport' };

export function SessionForm({ today, onClose }: { today: string; onClose: () => void }) {
  const create = useCreateSession();
  const [type, setType] = useState<WorkoutType>('gym');
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState('');
  const [gymFocus, setGymFocus] = useState('');
  const [cardioKind, setCardioKind] = useState('');
  const [distance, setDistance] = useState('');
  const [sportName, setSportName] = useState('');
  const [notes, setNotes] = useState('');
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
      await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setErrors(err instanceof ApiError ? (err.fields ?? { _form: err.message }) : { _form: 'Could not save' });
    }
  }

  return (
    <Modal title="Log session" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Type" error={errors.type}>
          <select value={type} onChange={(e) => setType(e.target.value as WorkoutType)}>
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
          <button type="submit" className="primary" disabled={create.isPending}>
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

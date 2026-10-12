import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { epley1rm, localDateOf, type LiftSummary } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { useTimezone } from '../../../api/hooks/settings';
import {
  useAddTopSet,
  useCreateLift,
  useDeleteLift,
  useDeleteTopSet,
  useLiftHistory,
  useLifts,
  useRenameLift,
} from '../../../api/hooks/workouts';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { LiftHistoryChart } from './LiftHistoryChart';
import './workouts.css';

type LiftInfo = LiftSummary['lift'];

function AddSetModal({ lift, today, onClose }: { lift: LiftInfo; today: string; onClose: () => void }) {
  const add = useAddTopSet();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await add.mutateAsync({
        liftId: lift.id,
        date,
        weightKg: Number(weight),
        reps: Number(reps),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onClose();
    } catch (err) {
      setErrors(err instanceof ApiError ? (err.fields ?? { _form: err.message }) : { _form: 'Could not save' });
    }
  }

  return (
    <Modal title={`Add top set: ${lift.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Date" error={errors.date}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Weight (kg)" error={errors.weightKg}>
          <input type="number" step="0.5" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} required />
        </Field>
        <Field label="Reps" error={errors.reps}>
          <input type="number" min={1} value={reps} onChange={(e) => setReps(e.target.value)} required />
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
          <button type="submit" className="primary" disabled={add.isPending}>
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

function History({ lift }: { lift: LiftInfo }) {
  const history = useLiftHistory(lift.id);
  const del = useDeleteTopSet();
  const toast = useToast();
  const sets = [...(history.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h2>{lift.name} history</h2>
      {history.isLoading ? (
        <p className="muted">Loading…</p>
      ) : sets.length === 0 ? (
        <p className="muted">No sets yet.</p>
      ) : (
        <>
          <LiftHistoryChart sets={sets} name={lift.name} />
          <ul className="wk-list">
            {sets.map((s) => (
              <li key={s.id} className="wk-row">
                <span>
                  {s.date} · {s.weightKg} kg × {s.reps} <span className="muted">(e1RM {epley1rm(s.weightKg, s.reps).toFixed(1)} kg)</span>
                </span>
                <button onClick={() => {
                    if (!window.confirm(`Delete the ${s.date} set (${s.weightKg} kg × ${s.reps})?`)) return;
                    del.mutate(
                      { liftId: lift.id, setId: s.id },
                      { onError: (err) => toast.showError(err, 'Could not delete set') },
                    );
                  }}
                  aria-label={`Delete set ${s.date}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TopLiftsPage() {
  const tz = useTimezone();
  const today = localDateOf(new Date(), tz);
  const lifts = useLifts();
  const create = useCreateLift();
  const rename = useRenameLift();
  const del = useDeleteLift();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState<LiftInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = lifts.data?.find((l) => l.lift.id === selectedId)?.lift ?? null;

  async function run(p: Promise<unknown>) {
    try {
      await p;
    } catch (err) {
      toast.showError(err, 'Something went wrong');
    }
  }

  return (
    <section>
      <div className="wk-head">
        <h1>Top lifts</h1>
        <Link to="/areas/workouts">Workouts</Link>
      </div>
      <form
        className="wk-actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          void run(create.mutateAsync(newName.trim()).then(() => setNewName('')));
        }}
      >
        <input aria-label="New lift name" placeholder="New lift (e.g. Squat)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit">Add lift</button>
      </form>

      {lifts.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (lifts.data ?? []).length === 0 ? (
        <p className="muted">No lifts yet.</p>
      ) : (
        <div className="wk-lifts">
          {lifts.data!.map(({ lift, prs, lastSet }) => {
            const hasSets = lastSet != null;
            return (
              <article key={lift.id} className="card" aria-label={lift.name}>
                <h2>{lift.name}</h2>
                {prs.heaviest ? (
                  <>
                    <div>
                      {prs.heaviest.weightKg} kg × {prs.heaviest.reps}
                    </div>
                    {prs.bestE1rm && <div>e1RM {prs.bestE1rm.value.toFixed(1)} kg</div>}
                    <div className="muted">Last set {lastSet?.date}</div>
                  </>
                ) : (
                  <div className="muted">No sets yet</div>
                )}
                <div className="wk-actions">
                  <button className="primary" onClick={() => setAdding(lift)}>
                    Add top set
                  </button>
                  <button onClick={() => setSelectedId(selectedId === lift.id ? null : lift.id)} aria-expanded={selectedId === lift.id}>
                    History
                  </button>
                  <button
                    onClick={() => {
                      const name = window.prompt('Rename lift', lift.name)?.trim();
                      if (name && name !== lift.name) void run(rename.mutateAsync({ id: lift.id, name }));
                    }}
                  >
                    Rename
                  </button>
                  <button
                    disabled={hasSets}
                    onClick={() => {
                      if (window.confirm(`Delete the lift "${lift.name}"?`)) void run(del.mutateAsync(lift.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
                {hasSets && <p className="muted">Delete its sets first</p>}
              </article>
            );
          })}
        </div>
      )}
      {selected && <History lift={selected} />}
      {adding && <AddSetModal lift={adding} today={today} onClose={() => setAdding(null)} />}
    </section>
  );
}

import { useState } from 'react';
import { localDateOf } from '@life-tracker/shared';
import { ApiError } from '../../api/client';
import { usePendingReview, useSubmitReview, type ReviewEntry, type UnplannedEntry } from '../../api/hooks/review';
import type { WeekProgress } from '../../api/hooks/progress';
import { useTimezone } from '../../api/hooks/settings';
import { Field } from '../../components/Field';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { initialRowValue, ReviewRow, type RowValue } from './ReviewRow';
import { UnplannedForm } from './UnplannedForm';
import { toWorkoutDetails } from './WorkoutDetailsFields';

function Summary({ progress }: { progress: WeekProgress }) {
  const rows: Array<{ label: string; actual: number; goal: number | null; unit: string; color?: string }> = [
    ...progress.study.map((s) => ({ label: `Study: ${s.name}`, actual: s.actual, goal: s.goal, unit: 'min', color: s.color })),
    { label: 'Startup', actual: progress.startup.actual, goal: progress.startup.goal, unit: 'min' },
    { label: 'Workouts', actual: progress.workouts.total.actual, goal: progress.workouts.total.goal, unit: '' },
  ];
  return (
    <section className="card review-summary" aria-label="Week summary">
      <h2>This week so far</h2>
      {rows.map((r) => (
        <div key={r.label}>
          <div>
            {r.label}: {r.actual}
            {r.goal != null ? ` / ${r.goal}` : ''}
            {r.unit ? ` ${r.unit}` : ''}
          </div>
          {r.goal != null && <ProgressBar value={r.actual} max={r.goal} color={r.color} label={r.label} />}
        </div>
      ))}
    </section>
  );
}

export function ReviewPage() {
  const tz = useTimezone();
  const today = localDateOf(new Date(), tz);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const { data, isLoading, error: loadError } = usePendingReview(date);
  const submit = useSubmitReview();
  const toast = useToast();

  const [rows, setRows] = useState<Record<string, RowValue>>({});
  const [unplanned, setUnplanned] = useState<UnplannedEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<WeekProgress | null>(null);

  const pending = data?.pending ?? [];
  const reviewed = data?.reviewed ?? [];
  const valueFor = (id: string, block: (typeof pending)[number], isReviewed: boolean) => rows[id] ?? (isReviewed ? initialRowValue(block) : undefined);

  // Entries: every pending row, plus reviewed rows the user changed. Order is deterministic so server field indexes map back to rows.
  const entryBlocks = [...pending, ...reviewed.filter((b) => rows[b.id])];
  const allChosen = pending.every((b) => rows[b.id]);

  const changeDate = (d: string) => {
    setPicked(d || null);
    setRows({});
    setUnplanned([]);
    setFieldErrors({});
    setProgress(null);
  };
  const setRow = (id: string, v: RowValue) => {
    setRows((r) => ({ ...r, [id]: v }));
    setFieldErrors({});
  };

  const onSubmit = () => {
    const entries: ReviewEntry[] = entryBlocks.map((b) => {
      const v = rows[b.id]!;
      const entry: ReviewEntry = { blockId: b.id, outcome: v.outcome };
      if (v.outcome === 'partial') entry.actualMinutes = Number(v.minutes);
      if (b.category === 'workout' && v.outcome !== 'skipped') {
        const w = toWorkoutDetails(b.workoutType, v.workout);
        if (w) entry.workout = w;
      }
      if (b.category === 'startup' && b.startupTaskId && v.completeTask && v.outcome !== 'skipped') entry.completeStartupTask = true;
      return entry;
    });
    setFieldErrors({});
    submit.mutate(
      { date, entries, unplanned },
      {
        onSuccess: (res) => {
          setProgress(res.progress);
          setRows({});
          setUnplanned([]);
          toast.show('Review saved');
        },
        onError: (e) => {
          if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
          else toast.show(e instanceof Error ? e.message : 'Could not save review', 'error');
        },
      },
    );
  };

  const unplannedErrors = (i: number) =>
    Object.entries(fieldErrors)
      .filter(([k]) => k.startsWith(`unplanned.${i}.`) || k === `unplanned.${i}`)
      .map(([, m]) => m);
  const otherErrors = Object.entries(fieldErrors).filter(([k]) => !/^(entries|unplanned)\.\d+/.test(k));

  return (
    <div>
      <h1>Review</h1>
      <Field label="Date">
        <input type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value)} />
      </Field>

      {progress && <Summary progress={progress} />}
      {isLoading && <p className="muted">Loading…</p>}
      {loadError && <p className="error" role="alert">Could not load the review.</p>}

      {data && (
        <>
          <h2>To review</h2>
          {pending.length === 0 ? (
            <p className="muted">Nothing left to review.</p>
          ) : (
            <ul className="review-list">
              {pending.map((b) => {
                const idx = entryBlocks.indexOf(b);
                return <ReviewRow key={b.id} block={b} tz={tz} value={valueFor(b.id, b, false)} error={fieldErrors[`entries.${idx}.actualMinutes`]} onChange={(v) => setRow(b.id, v)} />;
              })}
            </ul>
          )}

          {unplanned.length > 0 && (
            <>
              <h2>Unplanned</h2>
              <ul className="review-list">
                {unplanned.map((u, i) => (
                  <li key={i} className="review-row">
                    <strong>{u.title}</strong>
                    {unplannedErrors(i).map((m) => (
                      <p key={m} className="error" role="alert">
                        {m}
                      </p>
                    ))}
                    <button type="button" onClick={() => setUnplanned((l) => l.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {otherErrors.map(([k, m]) => (
            <p key={k} className="error" role="alert">
              {m}
            </p>
          ))}

          <div className="review-actions">
            <button type="button" onClick={() => setAdding(true)}>
              Add unplanned activity
            </button>
            <button type="button" disabled={!allChosen || submit.isPending} onClick={onSubmit}>
              Submit review
            </button>
          </div>

          {reviewed.length > 0 && (
            <>
              <h2>Reviewed</h2>
              <ul className="review-list">
                {reviewed.map((b) => {
                  const idx = entryBlocks.indexOf(b);
                  return <ReviewRow key={b.id} block={b} tz={tz} value={valueFor(b.id, b, true)} error={fieldErrors[`entries.${idx}.actualMinutes`]} onChange={(v) => setRow(b.id, v)} />;
                })}
              </ul>
            </>
          )}
        </>
      )}

      {adding && (
        <UnplannedForm
          date={date}
          onClose={() => setAdding(false)}
          onAdd={(u) => {
            setUnplanned((l) => [...l, u]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

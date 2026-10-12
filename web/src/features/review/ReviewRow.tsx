import { blockMinutes, localTimeOf, type Block, type ReviewOutcome } from '@life-tracker/shared';
import { CategoryDot } from '../../components/CategoryDot';
import { Field } from '../../components/Field';
import { emptyWorkoutDraft, WorkoutDetailsFields, type WorkoutDraft } from './WorkoutDetailsFields';
import './review.css';

export interface RowValue {
  outcome: ReviewOutcome;
  minutes: string;
  workout: WorkoutDraft;
  /** True once the user changed a workout field; untouched rows send no workout payload. */
  workoutEdited: boolean;
  completeTask: boolean;
}

const OUTCOMES: Array<{ outcome: ReviewOutcome; label: string }> = [
  { outcome: 'done', label: '✅ Done' },
  { outcome: 'partial', label: '◐ Partly' },
  { outcome: 'skipped', label: '✗ Skipped' },
];

/** The value implied by an already-reviewed block's saved status. */
export function initialRowValue(block: Block): RowValue | undefined {
  const outcome = block.status === 'done' || block.status === 'partial' || block.status === 'skipped' ? block.status : undefined;
  if (!outcome) return undefined;
  return {
    outcome,
    minutes: String(block.actualMinutes ?? Math.round(blockMinutes(block) / 2)),
    workout: emptyWorkoutDraft,
    workoutEdited: false,
    completeTask: false,
  };
}

export function ReviewRow({
  block,
  tz,
  value,
  errors = {},
  onChange,
}: {
  block: Block;
  tz: string;
  value: RowValue | undefined;
  /** Server messages for this row keyed by the part after `entries.N.` (e.g. `actualMinutes`). */
  errors?: Record<string, string>;
  onChange: (next: RowValue) => void;
}) {
  const duration = blockMinutes(block);
  const base: RowValue = value ?? { outcome: 'done', minutes: '', workout: emptyWorkoutDraft, workoutEdited: false, completeTask: false };
  const choose = (outcome: ReviewOutcome) =>
    onChange({
      ...base,
      outcome,
      minutes: outcome === 'partial' && !base.minutes ? String(Math.round(duration / 2)) : base.minutes,
    });
  const outcome = value?.outcome;
  const minutesError = outcome === 'partial' ? errors.actualMinutes : undefined;
  const otherErrors = Object.entries(errors).filter(([k]) => k !== 'actualMinutes' || outcome !== 'partial');

  return (
    <li className="review-row" role="group" aria-label={block.title}>
      <div className="review-row-head">
        <CategoryDot category={block.category} />
        <strong>{block.title}</strong>
        <span className="muted">
          {localTimeOf(new Date(block.start), tz)}–{localTimeOf(new Date(block.end), tz)}
        </span>
      </div>
      <div className="review-outcomes">
        {OUTCOMES.map((o) => (
          <button key={o.outcome} type="button" aria-pressed={outcome === o.outcome} onClick={() => choose(o.outcome)}>
            {o.label}
          </button>
        ))}
      </div>
      {outcome === 'partial' && (
        <Field label="Minutes done" error={minutesError}>
          <input type="number" inputMode="numeric" min="1" value={value!.minutes} onChange={(e) => onChange({ ...value!, minutes: e.target.value })} />
        </Field>
      )}
      {block.category === 'workout' && (outcome === 'done' || outcome === 'partial') && (
        <WorkoutDetailsFields workoutType={block.workoutType} value={value!.workout} onChange={(workout) => onChange({ ...value!, workout, workoutEdited: true })} />
      )}
      {block.category === 'startup' && block.startupTaskId && outcome && outcome !== 'skipped' && (
        <label className="review-check">
          <input type="checkbox" checked={value!.completeTask} onChange={(e) => onChange({ ...value!, completeTask: e.target.checked })} />
          Mark task done
        </label>
      )}
      {otherErrors.map(([k, m]) => (
        <p key={k} className="error" role="alert">
          {m}
        </p>
      ))}
    </li>
  );
}

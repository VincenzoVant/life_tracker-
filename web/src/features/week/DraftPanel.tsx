import { addDays, localDateOf, zonedToUtc, type ApiShortfall, type Metric, type PlanDraft } from '@life-tracker/shared';
import { useState } from 'react';
import { useAddDraftBlock, useCommitPlan, useCreatePlan, useDiscardPlan } from '../../api/hooks/plans';
import { useTimezone } from '../../api/hooks/settings';
import { useWeekProgress } from '../../api/hooks/progress';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { BlockForm } from '../blocks/BlockForm';
import { dayLabel } from './days';

const hoursText = (minutes: number): string => `${Number((minutes / 60).toFixed(1))} h`;

/** "Can't fit: 1.5 h of Econometrics", "Can't fit: 1 gym session", "Only 1 of 2 free evenings". */
export function describeShortfall(s: ApiShortfall, reservedEvenings: number): string {
  if (s.kind === 'free_evenings') return `Only ${Math.max(0, reservedEvenings)} of ${reservedEvenings + s.missing} free evenings`;
  if (s.kind === 'workout') {
    const noun = `${s.workoutType ? `${s.workoutType} ` : ''}session${s.missing === 1 ? '' : 's'}`;
    return `Can't fit: ${s.missing} ${noun}`;
  }
  const what = s.kind === 'study' ? (s.courseName ?? 'study') : 'startup work';
  return `Can't fit: ${s.unit === 'minutes' ? hoursText(s.missing) : s.missing} of ${what}`;
}

function ProjectionRow({ label, metric, minutes }: { label: string; metric: Metric; minutes: boolean }) {
  const fmt = (n: number) => (minutes ? hoursText(n) : String(n));
  return (
    <li>
      {label}: {fmt(metric.planned)}
      {metric.goal !== null && ` of ${fmt(metric.goal)}`}
    </li>
  );
}

export interface PlanBarProps {
  weekStart: string;
  /** Monday of the current local week. */
  thisWeek: string;
  hasDraft: boolean;
}

/** "Plan this week" / "Plan next week" button (never for past weeks), or the draft banner when a draft exists. */
export function PlanBar({ weekStart, thisWeek, hasDraft }: PlanBarProps) {
  const create = useCreatePlan();
  const toast = useToast();
  if (hasDraft) return <p className="draft-banner">Draft — review and commit</p>;
  const label = weekStart === thisWeek ? 'Plan this week' : weekStart === addDays(thisWeek, 7) ? 'Plan next week' : null;
  if (!label) return null;
  return (
    <div className="draft-banner">
      <button
        type="button"
        className="primary"
        disabled={create.isPending}
        onClick={() =>
          create.mutate(weekStart, { onError: (e) => toast.showError(e, 'Could not plan the week') })
        }
      >
        {label}
      </button>
    </div>
  );
}

export interface DraftPanelProps {
  draft: PlanDraft;
  weekStart: string;
}

/** Review of the week's draft plan: projected progress, what could not be placed, and commit/discard. */
export function DraftPanel({ draft, weekStart }: DraftPanelProps) {
  const { plan } = draft;
  const progress = useWeekProgress(weekStart, { includeProposed: true });
  const add = useAddDraftBlock();
  const commit = useCommitPlan();
  const discard = useDiscardPlan();
  const toast = useToast();
  const tz = useTimezone();
  const [adding, setAdding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { shortfalls, reservedEvenings } = plan.summary;
  const p = progress.data;

  // A new block starts today when today is in the draft's week, else on the week's Monday at 09:00.
  const today = localDateOf(new Date(), tz);
  const initialStart = today >= weekStart && today <= addDays(weekStart, 6) ? undefined : zonedToUtc(weekStart, '09:00', tz);

  const fail = (e: unknown) => toast.showError(e, 'Something went wrong');

  return (
    <aside className="draft-panel" aria-label="Draft plan">
      <h2>Draft plan</h2>

      <h3>Projected progress</h3>
      {progress.isPending && <p className="muted">Loading…</p>}
      {p && (
        <ul>
          {p.study.map((c) => (
            <ProjectionRow key={c.courseId} label={c.name} metric={c} minutes />
          ))}
          <ProjectionRow label="Startup" metric={p.startup} minutes />
          <ProjectionRow label="Workouts" metric={p.workouts.total} minutes={false} />
          <ProjectionRow label="Free evenings" metric={p.freeEvenings} minutes={false} />
        </ul>
      )}

      {shortfalls.length > 0 && (
        <>
          <h3>Shortfalls</h3>
          <ul>
            {shortfalls.map((s, i) => (
              <li key={i}>{describeShortfall(s, reservedEvenings.length)}</li>
            ))}
          </ul>
        </>
      )}

      {reservedEvenings.length > 0 && (
        <>
          <h3>Reserved evenings</h3>
          <p>{reservedEvenings.map(dayLabel).join(', ')}</p>
        </>
      )}

      {confirmDiscard ? (
        <div role="alertdialog" aria-label="Discard draft">
          <p>Discard this draft? Its proposed blocks will be removed.</p>
          <div className="form-actions">
            <button type="button" onClick={() => setConfirmDiscard(false)}>
              Keep draft
            </button>
            <button
              type="button"
              disabled={discard.isPending}
              onClick={() => discard.mutate(plan.id, { onSuccess: () => toast.show('Draft discarded'), onError: fail })}
            >
              Confirm discard
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" onClick={() => setAdding(true)}>
            Add block
          </button>
          <button type="button" onClick={() => setConfirmDiscard(true)}>
            Discard
          </button>
          <button
            type="button"
            className="primary"
            disabled={commit.isPending}
            onClick={() => commit.mutate(plan.id, {
                onSuccess: (res) => {
                  const n = res?.skipped ?? 0;
                  toast.show(
                    n > 0
                      ? `Week committed — ${n} ${n === 1 ? 'block' : 'blocks'} skipped because they were in the past or clashed with something new`
                      : 'Week committed',
                  );
                },
                onError: fail,
              })}
          >
            Commit
          </button>
        </div>
      )}

      {adding && (
        <Modal title="Add block to draft" onClose={() => setAdding(false)}>
          <BlockForm
            initial={initialStart && { start: initialStart.toISOString() }}
            onDone={() => setAdding(false)}
            onCreate={(input) => add.mutateAsync({ planId: plan.id, ...input })} />
        </Modal>
      )}
    </aside>
  );
}

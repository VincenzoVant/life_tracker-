import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useApplyReplan, useKeepAsIs, useReplanDraft, useRetryReplan } from '../../api/hooks/replan';
import { useToast } from '../../components/Toast';
import '../quickAdd/quickAdd.css';
import { ChangeSummary } from './ChangeSummary';

export function ReplanPage() {
  const { planId = '' } = useParams();
  // Keyed so a retry that lands on a new plan starts from clean local state.
  return <ReplanView key={planId} planId={planId} />;
}

function ReplanView({ planId }: { planId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const draft = useReplanDraft(planId);
  const apply = useApplyReplan();
  const keep = useKeepAsIs();
  const retry = useRetryReplan();
  const [stale, setStale] = useState<string>();
  const [nothingToMove, setNothingToMove] = useState(false);

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'Something went wrong', 'error');
  const busy = apply.isPending || keep.isPending || retry.isPending;

  async function onApply() {
    try {
      await apply.mutateAsync(planId);
      navigate('/week');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStale(e.message);
      else fail(e);
    }
  }
  async function onKeep() {
    try {
      await keep.mutateAsync(planId);
      navigate('/');
    } catch (e) {
      fail(e);
    }
  }
  async function onRetry() {
    try {
      const res = await retry.mutateAsync(planId);
      if ('plan' in res) navigate(`/replan/${res.plan.id}`);
      else {
        setStale(undefined);
        setNothingToMove(true);
      }
    } catch (e) {
      fail(e);
    }
  }

  if (draft.isPending) return <p className="muted">Loading…</p>;
  if (draft.isError || !draft.data) {
    return (
      <p className="error" role="alert">
        Couldn't load this replan.
      </p>
    );
  }
  if (nothingToMove) {
    return (
      <div>
        <h1>Nothing needs to move</h1>
        <button type="button" className="primary" onClick={() => navigate('/')}>
          Back to Today
        </button>
      </div>
    );
  }

  const open = draft.data.plan.status === 'draft';
  return (
    <div>
      <h1>Here's what would change</h1>
      <ChangeSummary draft={draft.data} />
      {stale && (
        <p className="error" role="alert">
          {stale}
        </p>
      )}
      {!open && <p className="muted">This replan has already been {draft.data.plan.status}.</p>}
      <div className="replan-actions">
        {stale ? (
          <button type="button" className="primary" disabled={busy} onClick={onRetry}>
            Replan again
          </button>
        ) : (
          open && (
            <button type="button" className="primary" disabled={busy} onClick={onApply}>
              Apply
            </button>
          )
        )}
        {open && (
          <button type="button" disabled={busy} onClick={onKeep}>
            Keep as is
          </button>
        )}
      </div>
    </div>
  );
}

import { REVIEW_PROMPT_TIME_DEFAULT, dayRangeUtc, localDateOf, localTimeOf, weekStartOf } from '@life-tracker/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useBlocks } from '../../api/hooks/blocks';
import { usePreferences } from '../../api/hooks/preferences';
import { useSettings, useTimezone } from '../../api/hooks/settings';
import { Modal } from '../../components/Modal';
import { BlockForm } from '../blocks/BlockForm';
import { ChangesFeed } from './ChangesFeed';
import { MacroSummary } from './MacroSummary';
import { NextUpCard, pickNextUp } from './NextUpCard';
import { Timeline } from './Timeline';
import '../quickAdd/quickAdd.css';
import './today.css';

/** Waits for settings so "today" and the review emphasis use the configured timezone, not the browser's. */
export function TodayPage() {
  const settings = useSettings();
  if (settings.isPending) return <p className="muted">Loading…</p>;
  return <TodayContent />;
}

function TodayContent() {
  const tz = useTimezone();
  const [adding, setAdding] = useState(false);
  const now = new Date();
  const today = localDateOf(now, tz);
  const range = useMemo(() => {
    const r = dayRangeUtc(today, tz);
    return { from: r.start.toISOString(), to: r.end.toISOString() };
  }, [today, tz]);
  const { data, isPending, isError } = useBlocks(range);
  const { data: prefs } = usePreferences();

  const blocks = useMemo(
    () => (data ?? []).filter((b) => b.status !== 'removed').sort((a, b) => a.start.localeCompare(b.start)),
    [data],
  );
  const emphasize = localTimeOf(now, tz) >= (prefs?.reviewPromptTime ?? REVIEW_PROMPT_TIME_DEFAULT);

  return (
    <div className="today-stack">
      <div className="today-header">
        <h1>Today</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add block
        </button>
      </div>
      <ChangesFeed />
      <Link to="/quick-add" className="link-button primary-link something-came-up">
        + Something came up
      </Link>
      <NextUpCard block={pickNextUp(blocks, now)} tz={tz} />
      <MacroSummary weekStart={weekStartOf(now, tz)} today={today} />
      {isPending ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <p className="error" role="alert">
          Couldn't load today's blocks.
        </p>
      ) : (
        <Timeline blocks={blocks} tz={tz} />
      )}
      <div>
        <Link to="/review" className={emphasize ? 'link-button emphasized' : 'link-button'}>
          End-of-day review
        </Link>
      </div>
      {adding && (
        <Modal title="Add block" onClose={() => setAdding(false)}>
          <BlockForm onDone={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

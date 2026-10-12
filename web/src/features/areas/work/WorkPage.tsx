import { localDateOf, localTimeOf } from '@life-tracker/shared';
import { useBlocks } from '../../../api/hooks/blocks';
import { useWeekProgress } from '../../../api/hooks/progress';
import { useTimezone } from '../../../api/hooks/settings';
import { currentWeek, hours } from '../format';
import '../areas.css';
import { SettingsGate } from '../../../components/SettingsGate';

function WorkPageContent() {
  const tz = useTimezone();
  const { weekStart, from, to } = currentWeek(tz);
  const blocks = useBlocks({ from, to });
  const progress = useWeekProgress(weekStart);
  const work = (blocks.data ?? [])
    .filter((b) => b.category === 'work' && b.status !== 'removed' && b.status !== 'proposed')
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div>
      <h1>Work</h1>
      <div className="card section">
        <div className="area-row">
          <span>Planned</span>
          <strong>{hours(progress.data?.work.planned ?? 0)} h</strong>
        </div>
        <div className="area-row">
          <span>Actual</span>
          <strong>{hours(progress.data?.work.actual ?? 0)} h</strong>
        </div>
      </div>
      <h2>This week</h2>
      {blocks.isLoading && <p className="muted">Loading…</p>}
      {blocks.data && work.length === 0 && <p className="muted">No work blocks this week.</p>}
      <ul className="area-list">
        {work.map((b) => (
          <li key={b.id} className="card area-row">
            <span>{localDateOf(new Date(b.start), tz)}</span>
            <span>
              {localTimeOf(new Date(b.start), tz)}–{localTimeOf(new Date(b.end), tz)}
            </span>
            <span className="muted">{b.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkPage() {
  return (
    <SettingsGate>
      <WorkPageContent />
    </SettingsGate>
  );
}

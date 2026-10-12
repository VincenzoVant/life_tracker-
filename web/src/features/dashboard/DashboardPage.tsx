import { useState } from 'react';
import { CATEGORY_META, WORKOUT_TYPES, addDays, weekStartOf } from '@life-tracker/shared';
import { useWeekProgress } from '../../api/hooks/progress';
import { useTimezone } from '../../api/hooks/settings';
import { StreakTiles } from './StreakTiles';
import { TrendsSection } from './TrendsSection';
import { AreaProgressRow, formatCount } from './AreaProgressRow';
import './dashboard.css';

const dotClass = (ok: boolean | null) => (ok === null ? 'nutrition-dot' : ok ? 'nutrition-dot ok' : 'nutrition-dot bad');
const dotText = (ok: boolean | null) => (ok === null ? 'no data' : ok ? 'on target' : 'off target');

export function DashboardPage() {
  const tz = useTimezone();
  const thisWeek = weekStartOf(new Date(), tz);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const current = weekStart ?? thisWeek;
  const { data, isPending, isError } = useWeekProgress(current);

  return (
    <div>
      <h1>Dashboard</h1>
      <StreakTiles />
      <div className="week-switcher">
        <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(current, -7))}>
          ◀
        </button>
        <div className="week-title">
          <strong>{current === thisWeek ? 'This week' : `Week of ${current}`}</strong>
          {current === thisWeek && <div className="muted">{`Week of ${current}`}</div>}
        </div>
        <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(current, 7))}>
          ▶
        </button>
      </div>
      {isPending && <p className="muted">Loading…</p>}
      {isError && (
        <p className="error" role="alert">
          Could not load progress.
        </p>
      )}
      {data && (
        <ul className="area-list">
          {data.study.map((c) => (
            <AreaProgressRow key={c.courseId} label={c.name} color={c.color} metric={c} />
          ))}
          <AreaProgressRow label="Startup" color={CATEGORY_META.startup.color} metric={data.startup} />
          <AreaProgressRow label="Work" color={CATEGORY_META.work.color} metric={data.work} />
          <AreaProgressRow label="Workouts" color={CATEGORY_META.workout.color} metric={data.workouts.total} format={formatCount}>
            <ul className="area-sub">
              {WORKOUT_TYPES.map((t) => (
                <AreaProgressRow
                  key={t}
                  label={t[0]!.toUpperCase() + t.slice(1)}
                  color={CATEGORY_META.workout.color}
                  metric={data.workouts.byType[t]}
                  format={formatCount}
                />
              ))}
            </ul>
          </AreaProgressRow>
          <AreaProgressRow label="Free evenings" color={CATEGORY_META.rest.color} metric={data.freeEvenings} format={formatCount} />
          <li className="area-row">
            <div className="area-row-head">
              <span className="area-row-label">Nutrition</span>
              <span className="muted area-row-summary">Mon to Sun</span>
            </div>
            {(['kcal', 'protein'] as const).map((k) => (
              <div className="nutrition-dots" key={k}>
                <span className="dots-label">{k === 'kcal' ? 'Calories' : 'Protein'}</span>
                {data.nutrition.map((d) => {
                  const ok = k === 'kcal' ? d.kcalOk : d.proteinOk;
                  const name = k === 'kcal' ? 'Calories' : 'Protein';
                  return <span key={d.date} className={dotClass(ok)} role="img" aria-label={`${name} ${d.date}: ${dotText(ok)}`} />;
                })}
              </div>
            ))}
          </li>
        </ul>
      )}
      <TrendsSection />
    </div>
  );
}

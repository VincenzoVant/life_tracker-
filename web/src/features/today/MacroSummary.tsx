import { useWeekProgress } from '../../api/hooks/progress';

const fmt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toString());

export function MacroSummary({ weekStart, today }: { weekStart: string; today: string }) {
  const { data } = useWeekProgress(weekStart);
  const day = data?.nutrition.find((n) => n.date === today);
  return (
    <section className="card" aria-label="Macros">
      <h2 className="today-card-title">Nutrition today</h2>
      <div className="macro-row">
        <div>
          <strong>
            {fmt(day?.kcal ?? 0)} / {fmt(day?.kcalTarget)}
          </strong>{' '}
          kcal
        </div>
        <div>
          <strong>
            {fmt(day?.proteinG ?? 0)} / {fmt(day?.proteinTarget)}
          </strong>{' '}
          g protein
        </div>
      </div>
    </section>
  );
}

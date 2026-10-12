import { useStreaks } from '../../api/hooks/progress';

export function StreakTiles() {
  const { data } = useStreaks();
  if (!data) return null;
  return (
    <div className="streak-tiles">
      <div className="streak-tile">🔥 {data.reviewDays}-day review streak</div>
      <div className="streak-tile">💪 {data.workoutWeeks}-week workout streak</div>
    </div>
  );
}

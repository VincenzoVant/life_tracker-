import type { Preferences } from '@life-tracker/shared';
import { useCourses } from '../../../api/hooks/courses';
import { usePreferences } from '../../../api/hooks/preferences';
import { useTimezone } from '../../../api/hooks/settings';
import { AreaTabs } from '../../../components/planning';
import { SettingsGate } from '../../../components/SettingsGate';
import { currentWeek, hours } from '../format';
import { CoursesTab } from './CoursesTab';
import { StudyHoursTab, pickStudy } from './StudyHoursTab';
import { availableStudyMinutes } from './studyTime';
import '../areas.css';
import './studies.css';

function StudySummary({ prefs }: { prefs: Preferences | undefined }) {
  const courses = useCourses();
  if (!courses.data || !prefs) return null;
  const goal = courses.data.reduce((n, c) => n + c.weeklyGoalMinutes, 0);
  const available = availableStudyMinutes(prefs);
  const capped = prefs.maxStudyMinutesPerDay * 7;
  return (
    <div className="card study-summary" aria-label="Study summary">
      <div className="study-stat">
        <span className="muted">Weekly study goal</span>
        <strong>{hours(goal)} h</strong>
      </div>
      <div className="study-stat">
        <span className="muted">{prefs.studyWindows.length > 0 ? 'Inside your study windows' : 'Free in your days'}</span>
        <strong>{hours(available)} h</strong>
      </div>
      {goal > available && (
        <p className="study-warning" role="status">
          Your courses need {hours(goal - available)} h more than {prefs.studyWindows.length > 0 ? 'your study windows' : 'your days'} allow.
          Widen your study hours or lower a course goal.
        </p>
      )}
      {goal <= available && goal > capped && (
        <p className="study-warning" role="status">
          Your daily study limit allows at most {hours(capped)} h a week.
        </p>
      )}
    </div>
  );
}

function StudiesPageContent() {
  const tz = useTimezone();
  const { weekStart } = currentWeek(tz);
  const prefs = usePreferences();
  const study = prefs.data ? pickStudy(prefs.data) : null;

  return (
    <div>
      <div className="area-head">
        <h1>Studies</h1>
      </div>
      <StudySummary prefs={prefs.data} />
      <AreaTabs
        tabs={[
          { key: 'courses', label: 'Courses', render: () => <CoursesTab weekStart={weekStart} /> },
          {
            key: 'hours',
            label: 'Study hours',
            render: () =>
              study ? <StudyHoursTab key={JSON.stringify(study)} initial={study} /> : <p className="muted">Loading study hours…</p>,
          },
        ]}
      />
    </div>
  );
}

export function StudiesPage() {
  return (
    <SettingsGate>
      <StudiesPageContent />
    </SettingsGate>
  );
}

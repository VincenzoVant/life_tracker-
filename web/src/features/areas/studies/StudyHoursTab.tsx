import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Preferences } from '@life-tracker/shared';
import { ApiError } from '../../../api/client';
import { usePatchPreferences } from '../../../api/hooks/preferences';
import { Field } from '../../../components/Field';
import { useToast } from '../../../components/Toast';
import { TimeWindowEditor, subErrors } from '../../../components/planning';

export const STUDY_KEYS = [
  'studyWindows',
  'preferredStudyWindows',
  'studyBlock',
  'maxStudyMinutesPerDay',
  'maxMinutesPerCoursePerDay',
  'classesCountTowardStudy',
] as const;
export type StudyPrefs = Pick<Preferences, (typeof STUDY_KEYS)[number]>;

export const pickStudy = (p: Preferences): StudyPrefs =>
  Object.fromEntries(STUDY_KEYS.map((k) => [k, structuredClone(p[k])])) as StudyPrefs;

const NUM_KEYS = ['studyBlock.min', 'studyBlock.max', 'maxStudyMinutesPerDay', 'maxMinutesPerCoursePerDay'];
const isRendered = (key: string) => NUM_KEYS.includes(key) || /^(studyWindows|preferredStudyWindows)\.\d+\.(start|end|days)$/.test(key);

export function StudyHoursTab({ initial }: { initial: StudyPrefs }) {
  const [p, setP] = useState<StudyPrefs>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Raw text of numeric inputs, so a cleared input stays empty instead of becoming 0.
  const [raw, setRaw] = useState<Record<string, string>>({});
  const save = usePatchPreferences();
  const toast = useToast();
  const patch = (x: Partial<StudyPrefs>) => setP((cur) => ({ ...cur, ...x }));
  const unmatched = Object.entries(errors).filter(([k]) => !isRendered(k));

  const num = (label: string, key: string, value: number, set: (v: number) => void, step = 15) => (
    <Field label={label} error={errors[key]}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        value={raw[key] ?? String(value)}
        onChange={(e) => {
          const text = e.target.value;
          setRaw((r) => ({ ...r, [key]: text }));
          // NaN serialises to null, which the server rejects with a field error rather than saving 0.
          set(text.trim() === '' ? Number.NaN : Number(text));
        }}
      />
    </Field>
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    try {
      await save.mutateAsync(p);
      toast.show('Study hours saved');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.showError(err, 'Could not save study hours');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend>When can you study?</legend>
        <p className="muted">The planner only puts study blocks inside these windows.</p>
        <TimeWindowEditor
          label="Study window"
          windows={p.studyWindows}
          onChange={(w) => patch({ studyWindows: w })}
          errors={subErrors(errors, 'studyWindows')}
          emptyText="Any time between your earliest and latest block"
          newWindow={{ days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }}
        />
      </fieldset>
      <fieldset>
        <legend>When do you prefer to study?</legend>
        <p className="muted">Study goes here first when there is room.</p>
        <TimeWindowEditor
          label="Preferred study window"
          windows={p.preferredStudyWindows}
          onChange={(w) => patch({ preferredStudyWindows: w })}
          errors={subErrors(errors, 'preferredStudyWindows')}
          emptyText="No preference"
          newWindow={{ days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }}
        />
      </fieldset>
      <fieldset>
        <legend>Study blocks</legend>
        {num('Study block min (min)', 'studyBlock.min', p.studyBlock.min, (v) => patch({ studyBlock: { ...p.studyBlock, min: v } }))}
        {num('Study block max (min)', 'studyBlock.max', p.studyBlock.max, (v) => patch({ studyBlock: { ...p.studyBlock, max: v } }))}
        {num('Max study per day (min)', 'maxStudyMinutesPerDay', p.maxStudyMinutesPerDay, (v) => patch({ maxStudyMinutesPerDay: v }), 1)}
        {num('Max per course per day (min)', 'maxMinutesPerCoursePerDay', p.maxMinutesPerCoursePerDay, (v) => patch({ maxMinutesPerCoursePerDay: v }), 1)}
        <label className="goal-off">
          <input type="checkbox" checked={p.classesCountTowardStudy} onChange={(e) => patch({ classesCountTowardStudy: e.target.checked })} />
          Classes count toward study
        </label>
        <p className="muted">
          Your class times and buffers are in <Link to="/areas/classes">Classes</Link>.
        </p>
      </fieldset>
      {unmatched.length > 0 && (
        <ul className="error" role="alert" aria-label="Other problems">
          {unmatched.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
      <button className="primary" type="submit" disabled={save.isPending}>
        Save study hours
      </button>
    </form>
  );
}

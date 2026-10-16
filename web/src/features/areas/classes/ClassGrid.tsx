import { useEffect, useState, type CSSProperties } from 'react';
import type { Course, FixedEvent, Preferences } from '@life-tracker/shared';
import { WEEKDAYS } from '../../../components/planning';
import { effectiveBuffer, eventColor, hourRange, layoutDay, textOn, toMinutes } from './grid';

const HOUR_PX = 48;
const NARROW = '(max-width: 599px)';

function useNarrow(): boolean {
  const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null);
  const [narrow, setNarrow] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

interface Props {
  events: FixedEvent[];
  courses: Course[];
  prefs: Preferences;
  onEdit: (ev: FixedEvent) => void;
}

const label = (ev: FixedEvent) => `${ev.title}, ${WEEKDAYS[ev.weekday - 1]} ${ev.startTime}–${ev.endTime}`;
const bufferText = (b: { before: number; after: number }) => `${b.before} min before · ${b.after} min after`;

/** Monday-Sunday week of fixed events with their buffers; a per-day list on narrow screens. */
export function ClassGrid(props: Props) {
  return useNarrow() ? <DayList {...props} /> : <WeekGrid {...props} />;
}

function WeekGrid({ events, courses, prefs, onEdit }: Props) {
  const { from, to } = hourRange(events, prefs);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const y = (min: number) => ((min - from * 60) / 60) * HOUR_PX;
  return (
    <div className="class-grid-scroll">
      <div className="class-grid" role="region" aria-label="Weekly class schedule" style={{ '--hour': `${HOUR_PX}px` } as CSSProperties}>
        <div className="cg-corner" />
        {WEEKDAYS.map((d) => (
          <div key={d} className="cg-dayhead" aria-hidden>
            {d.slice(0, 3)}
          </div>
        ))}
        <div className="cg-axis" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h) => (
            <span key={h} style={{ top: y(h * 60) }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="cg-day" role="group" aria-label={d} style={{ height: hours.length * HOUR_PX }}>
            {layoutDay(events.filter((ev) => ev.weekday === i + 1)).map(({ ev, lane, lanes }) => {
              const start = toMinutes(ev.startTime);
              const end = toMinutes(ev.endTime);
              const buf = effectiveBuffer(ev, prefs);
              const color = eventColor(ev, courses);
              const lanePos = { left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%`, '--ev': color } as CSSProperties;
              return (
                <div key={ev.id}>
                  {buf.before > 0 && (
                    <div className="cg-buffer" aria-hidden title={`${buf.before} min free before`} style={{ ...lanePos, top: y(start - buf.before), height: (buf.before / 60) * HOUR_PX }} />
                  )}
                  {buf.after > 0 && (
                    <div className="cg-buffer" aria-hidden title={`${buf.after} min free after`} style={{ ...lanePos, top: y(end), height: (buf.after / 60) * HOUR_PX }} />
                  )}
                  <button
                    type="button"
                    className={ev.active ? 'cg-event' : 'cg-event cg-inactive'}
                    aria-label={label(ev)}
                    title={`${label(ev)} (${bufferText(buf)})`}
                    onClick={() => onEdit(ev)}
                    style={{ ...lanePos, top: y(start), height: ((end - start) / 60) * HOUR_PX, color: textOn(color) }}
                  >
                    <strong>{ev.title}</strong>
                    <span>
                      {ev.startTime}–{ev.endTime}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayList({ events, courses, prefs, onEdit }: Props) {
  return (
    <div className="class-daylist">
      {WEEKDAYS.map((d, i) => {
        const day = events.filter((ev) => ev.weekday === i + 1).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return (
          <section key={d} aria-label={d}>
            <h3>{d}</h3>
            {day.length === 0 ? (
              <p className="muted">Free</p>
            ) : (
              <ul>
                {day.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" className="class-row" aria-label={label(ev)} onClick={() => onEdit(ev)} style={{ '--ev': eventColor(ev, courses) } as CSSProperties}>
                      <span className="class-row-bar" aria-hidden />
                      <span className="class-row-main">
                        <strong>{ev.title}</strong>
                        <span>
                          {ev.startTime}–{ev.endTime}
                        </span>
                        <span className="muted">Free {bufferText(effectiveBuffer(ev, prefs))}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

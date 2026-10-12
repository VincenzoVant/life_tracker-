import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
const DAY_MS = 86_400_000;
/** Date-only arithmetic: parse YYYY-MM-DD at UTC noon so it never depends on a timezone. */
function parseDate(date) {
    return new Date(`${date}T12:00:00Z`);
}
export function addDays(date, n) {
    return new Date(parseDate(date).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}
export function isoWeekday(date) {
    const d = parseDate(date).getUTCDay();
    return (d === 0 ? 7 : d);
}
export function localDateOf(instant, tz) {
    return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}
export function localTimeOf(instant, tz) {
    return formatInTimeZone(instant, tz, 'HH:mm');
}
export function zonedToUtc(date, time, tz) {
    return fromZonedTime(`${date}T${time}:00`, tz);
}
export function dayRangeUtc(date, tz) {
    return { start: zonedToUtc(date, '00:00', tz), end: zonedToUtc(addDays(date, 1), '00:00', tz) };
}
export function weekStartOf(instant, tz) {
    const date = localDateOf(instant, tz);
    return addDays(date, 1 - isoWeekday(date));
}
export function weekRangeUtc(weekStart, tz) {
    return { start: zonedToUtc(weekStart, '00:00', tz), end: zonedToUtc(addDays(weekStart, 7), '00:00', tz) };
}
export function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
export function minutesBetween(a, b) {
    return (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
}

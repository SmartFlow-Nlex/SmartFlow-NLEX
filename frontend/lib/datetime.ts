/**
 * Date formatting helpers.
 *
 * These are hand-rolled rather than using `toLocaleTimeString`, because Intl
 * support under Hermes still varies between Android and iOS builds and the
 * dashboard needs the timestamps to read identically on both.
 */

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "10:07 PM" */
export function formatTime(date: Date): string {
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(date.getMinutes())} ${suffix}`;
}

/**
 * "10:07:41 PM"
 *
 * For the one readout that runs on a seconds-accurate clock - the dashboard
 * status card, which owns its own 1s tick. Anything driven by a coarser clock
 * wants `formatTime`, or the seconds sit still and then jump.
 */
export function formatClock(date: Date): string {
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${suffix}`;
}

/** "9/1/2026" */
export function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/** "9/1/2026 10:07 PM" */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** "9/1/2026 at 10:07 PM" */
export function formatEventDateTime(date: Date): string {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const weekdayLongNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const monthLongNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "Thursday, 18 September"
 *
 * For headline timestamps, where `9/18/2026` reads like a filename. No year:
 * these are horizons of at most a couple of days, so the year is never the
 * thing in doubt, and dropping it keeps the line from wrapping on a phone.
 */
export function formatLongDate(date: Date): string {
  const weekday = weekdayLongNames[date.getDay()] ?? '';
  const month = monthLongNames[date.getMonth()] ?? '';
  return `${weekday}, ${date.getDate()} ${month}`;
}

/** "Tue" */
export function formatWeekday(date: Date): string {
  return weekdayNames[date.getDay()] ?? '';
}

/** "9 PM", used for compact axis labels. */
export function formatHourLabel(date: Date): string {
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}${suffix}`;
}

/** True when both dates fall on the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Today", "Tomorrow", or "in 3 days" / "Sat" for anything further out. */
export function describeDayOffset(target: Date, now: Date): string {
  const startOfDay = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(now)) / 86400000);

  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  if (days > 1 && days < 7) {
    return `In ${days} days`;
  }
  if (days === -1) {
    return 'Yesterday';
  }
  return formatDate(target);
}

/** "4 Oct" */
export function formatDayMonth(date: Date): string {
  return `${date.getDate()} ${(monthLongNames[date.getMonth()] ?? '').slice(0, 3)}`;
}

/** "Saturday, 7 November", with the year added when it is not this year. */
export function formatEventDay(date: Date, now: Date): string {
  const day = formatLongDate(date);
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/**
 * "Today", "Tomorrow", "In 5 days", "In 3 weeks", "In 5 months".
 *
 * For dates months out, where describeDayOffset falls back to the date itself
 * and would repeat what the card already says next to it.
 */
export function describeDaysAhead(target: Date, now: Date): string {
  const startOfDay = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(now)) / 86400000);

  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  if (days < 14) {
    return `In ${days} days`;
  }
  if (days < 60) {
    return `In ${Math.round(days / 7)} weeks`;
  }
  return `In ${Math.round(days / 30.44)} months`;
}

/** "Right now", "In 1 hour", "In 12 hours". */
export function describeHourOffset(hours: number): string {
  if (hours <= 0) {
    return 'Right now';
  }
  if (hours === 1) {
    return 'In 1 hour';
  }
  if (hours === 24) {
    return 'In 24 hours (this time tomorrow)';
  }
  return `In ${hours} hours`;
}

/**
 * Returns `base` advanced by whole hours, with seconds zeroed.
 *
 * The seconds are dropped because every caller renders the result at minute
 * precision off a clock that ticks on its own schedule. Keeping them would
 * make "in 3 hours" land on a different second each tick - the same horizon
 * described two ways depending on when you happened to look.
 */
export function addHours(base: Date, hours: number): Date {
  const next = new Date(base);
  next.setHours(next.getHours() + hours, next.getMinutes(), 0, 0);
  return next;
}

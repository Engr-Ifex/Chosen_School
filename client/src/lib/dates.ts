/**
 * Date formatting at the edge (AGENTS.md §6: store UTC, format at the edge).
 *
 * The school is UTC+1 with no daylight saving. Two kinds of value, two rules:
 *  - **Calendar days** (event dates, visit dates) are stored as UTC midnight
 *    and must be formatted **in UTC**, or a viewer west of Greenwich would see
 *    the previous day.
 *  - **Instants** (published, expires) are shown in the **school's** time.
 */

export const SCHOOL_TIME_ZONE = 'Africa/Lagos';

export function formatDay(iso: string | null | undefined, weekday = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    ...(weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Fri, 4 December 2026" or "Fri, 4 – Sun, 6 December 2026" for a range. */
export function formatDayRange(start: string, end: string): string {
  return start.slice(0, 10) === end.slice(0, 10) ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SCHOOL_TIME_ZONE,
  });
}

/** `<input type="datetime-local">` value, in school time, from an ISO instant. */
export function toSchoolLocalInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** ISO instant from a `datetime-local` value typed in school time (UTC+1). */
export function fromSchoolLocalInput(value: string): string | null {
  return value ? `${value}:00+01:00` : null;
}

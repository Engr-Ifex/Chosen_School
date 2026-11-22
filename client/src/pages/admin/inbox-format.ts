import type { InboxKind, InboxStatus } from '../../lib/admin-api';
import type { StatusTone } from '../../components/ui/StatusBadge';

/** Labels and copy for each inbox, so the list and detail pages agree. */
export const INBOX_COPY: Record<InboxKind, { title: string; singular: string; empty: string }> = {
  enquiries: {
    title: 'Enquiries',
    singular: 'Enquiry',
    empty: 'No enquiries yet.',
  },
  'visit-requests': {
    title: 'Visit requests',
    singular: 'Visit request',
    empty: 'No visit requests yet.',
  },
};

export const STATUS_TONES: Record<InboxStatus, StatusTone> = {
  new: 'info',
  reviewed: 'warning',
  responded: 'success',
};

/** A submission time, shown in the school's time zone (UTC+1, no DST). */
export function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}

/**
 * A requested visit day. Stored as UTC midnight, so it is formatted in UTC —
 * formatting it locally would move the day for anyone west of Greenwich.
 */
export function formatVisitDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatSection(value: string): string {
  return value === 'primary' ? 'Primary' : value === 'secondary' ? 'Secondary' : value;
}

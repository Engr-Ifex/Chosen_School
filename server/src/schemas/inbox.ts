/**
 * Zod schemas for enquiries and visit requests — the boundary (API_SPEC §2.7,
 * §4.4). Limits mirror docs/DATA_MODEL.md §5 and §6; Mongoose validates again
 * as a backstop.
 *
 * **Unknown keys are stripped, not rejected, on the public forms** — the same
 * rule as admissions (API-P08). `status`, `archivedAt` and the timestamps are
 * absent from these schemas, so a visitor cannot set them even by accident.
 *
 * **The admin status update is strict.** API_SPEC §4.4 says `PATCH` updates
 * `status` only. Silently ignoring a `name` in that body would let the admin
 * think they had corrected something they had not, so extra keys are a
 * `VALIDATION_ERROR`.
 */

import { z } from 'zod';
import { PHONE_PATTERN } from '../lib/phone.js';
import { INBOX_STATUSES } from '../models/inbox.js';
import { TIME_PATTERN } from '../models/visitrequest.js';

const requiredText = (max: number, label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/** "" means "not supplied", so an empty optional field is not stored. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const phone = z
  .string({ message: 'Phone number is required' })
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => PHONE_PATTERN.test(digits), 'Phone number must contain between 7 and 15 digits');

const email = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((value) => (value === '' ? undefined : value))
  .refine((value) => value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'Email must be a valid email address',
  });

const section = z.enum(['primary', 'secondary'], {
  message: 'Choose Primary or Secondary',
});

export const enquiryInputSchema = z.object({
  name: requiredText(120, 'Name'),
  phone,
  email,
  section,
  message: requiredText(2000, 'Message'),
});

export type EnquiryInput = z.infer<typeof enquiryInputSchema>;

/** Today's date in UTC, at midnight — the comparison DATA_MODEL §6 specifies. */
function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * A calendar date, `YYYY-MM-DD`, stored as UTC midnight. A full timestamp is
 * rejected: a visit is requested for a day, and a timestamp's time zone would
 * move that day for anyone not on UTC.
 */
const preferredDate = z
  .string({ message: 'Preferred date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred date must be a date (YYYY-MM-DD)')
  .transform((value, ctx) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    // Rejects 2026-02-30, which `Date` would otherwise roll into March.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      ctx.addIssue({ code: 'custom', message: 'Preferred date must be a real date' });
      return z.NEVER;
    }
    if (date.getTime() < todayUtc(new Date()).getTime()) {
      ctx.addIssue({ code: 'custom', message: 'Preferred date cannot be in the past' });
      return z.NEVER;
    }
    return date;
  });

export const visitRequestInputSchema = z.object({
  name: requiredText(120, 'Name'),
  phone,
  email,
  section,
  preferredDate,
  preferredTime: z
    .string({ message: 'Preferred time is required' })
    .regex(TIME_PATTERN, 'Preferred time must be a time such as 14:30'),
  message: optionalText(1000, 'Message'),
});

export type VisitRequestInput = z.infer<typeof visitRequestInputSchema>;

export const statusUpdateSchema = z
  .object({
    status: z.enum(INBOX_STATUSES, {
      message: 'Status must be new, reviewed or responded',
    }),
  })
  .strict();

/** Sort keys each inbox accepts. Anything else is a `VALIDATION_ERROR`. */
export const INBOX_SORTS = {
  enquiries: ['createdAt'],
  visitRequests: ['createdAt', 'preferredDate'],
} as const;

export function inboxListQuerySchema(sorts: readonly string[]) {
  return z.object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(INBOX_STATUSES).optional(),
    /** `true` shows the archive instead of the active inbox. */
    archived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    sort: z
      .string()
      .trim()
      .max(40)
      .optional()
      .refine((value) => value === undefined || sorts.includes(value.replace(/^-/, '')), {
        message: `sort must be one of: ${sorts.join(', ')} (prefix - for descending)`,
      }),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  });
}

/** Zod failure → the error envelope's field map. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    // A strict schema reports extra keys as one issue at the root; name each.
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[key] ??= 'cannot be changed here';
      continue;
    }
    const path = issue.path.join('.');
    if (path && !(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

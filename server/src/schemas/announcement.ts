/**
 * Announcement, event and category validation — API_SPEC §2.4, §4.5, §4.9.
 *
 * **Create and update are strict.** `status` and `publishedAt` are not fields
 * here, so a body carrying them is a `VALIDATION_ERROR` naming the key
 * (API-A19). Publishing is its own action; there is no way to arrive
 * published, urgent or not.
 */

import { z } from 'zod';
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_STATUSES } from '../models/announcement.js';
import { CATEGORY_SCOPES } from '../models/category.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** `YYYY-MM-DD` → UTC midnight; rejects impossible dates rather than rolling them. */
const calendarDate = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .transform((value, ctx) => {
      const [y, m, d] = value.split('-').map(Number) as [number, number, number];
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a real date` });
        return z.NEVER;
      }
      return date;
    });

const eventSchema = z
  .object({
    startDate: calendarDate('Start date'),
    endDate: calendarDate('End date'),
  })
  .strict()
  .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: 'The end date cannot be before the start date',
    path: ['endDate'],
  });

/**
 * An instant with an explicit offset, e.g. `2026-12-01T17:00:00+01:00`. A bare
 * local time is refused: it would mean different instants on different
 * machines.
 */
const instant = z.iso
  .datetime({ offset: true, message: 'Expiry must be a date and time with a time zone' })
  .transform((value) => new Date(value));

const fields = {
  kind: z.enum(ANNOUNCEMENT_KINDS, { message: 'Choose announcement or event' }),
  title: z.string({ message: 'Title is required' }).trim().min(1, 'Title is required').max(160),
  categoryId: z
    .string()
    .regex(OBJECT_ID, 'Choose a category from the list')
    .nullable()
    .optional(),
  /** Raw editor HTML; the service sanitises it before anything is stored. */
  body: z.string({ message: 'Content is required' }).max(50_000, 'Content is too long'),
  isUrgent: z.boolean().optional(),
  expiresAt: instant.nullable().optional(),
  event: eventSchema.nullable().optional(),
};

export const announcementCreateSchema = z.object(fields).strict();
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;

export const announcementUpdateSchema = z
  .object({
    kind: fields.kind.optional(),
    title: fields.title.optional(),
    categoryId: fields.categoryId,
    body: fields.body.optional(),
    isUrgent: fields.isUrgent,
    expiresAt: fields.expiresAt,
    event: fields.event,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;

export const adminListQuerySchema = z.object({
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  kind: z.enum(ANNOUNCEMENT_KINDS).optional(),
  category: z.string().regex(OBJECT_ID).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicListQuerySchema = z.object({
  /** Category slug. */
  category: z.string().trim().max(70).regex(/^[a-z0-9-]+$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const categoryInputSchema = z
  .object({
    scope: z.enum(CATEGORY_SCOPES),
    name: z.string().trim().min(1, 'Name is required').max(60),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const categoryScopeQuerySchema = z.object({ scope: z.enum(CATEGORY_SCOPES) });

/** Zod failure → error-envelope field map, naming extra keys individually. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        fields[key] ??=
          key === 'status' || key === 'publishedAt'
            ? 'cannot be set here — publishing is a separate action'
            : 'is not a field that can be set';
      }
      continue;
    }
    const path = issue.path.join('.') || '_';
    if (!(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

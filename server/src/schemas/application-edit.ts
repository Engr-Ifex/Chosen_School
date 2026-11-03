/**
 * Zod schema for an administrator edit — `PATCH /admin/applications/:id`.
 *
 * **Partial by design.** Every field is optional, because a PATCH sends only what
 * changed; an absent field means "leave it alone", not "set it to empty". That
 * distinction is why the optional-text helper here differs from the one used for
 * submissions: there, an empty string means "not supplied", and here it means
 * "clear this value", which is a real correction an administrator may need.
 *
 * **Immutable fields are rejected, not stripped.** API_SPEC §4.2 is explicit: a
 * request that tries to set `submittedAt` must fail rather than quietly do
 * nothing, because a client that believes it changed something it did not is
 * worse off than one that gets an error. Unknown keys are still stripped, per
 * SECURITY §9 — the distinction is that these named fields are known and
 * forbidden, while an unknown key is simply not part of the contract.
 *
 * The section/class pair is **not** checked here. Validating it needs the stored
 * record — a PATCH may change only one of the two — so the service checks the
 * effective pair after merging, and reports the error against
 * `placement.classApplyingFor`.
 */

import { z } from 'zod';
import { PHONE_PATTERN, normalisePhone } from '../lib/phone.js';

/**
 * Fields a PATCH may never set. `_id`, `submittedAt`, `revisions` and `search`
 * are named in API_SPEC §4.2; the rest are here for the same reason — each is
 * either server-owned or belongs to a different slice.
 */
export const IMMUTABLE_FIELDS = [
  '_id',
  'id',
  'submittedAt',
  'revisions',
  'search',
  'deletedAt',
  'deletedBy',
  'photo',
  'signature',
] as const;

const editText = (max: number) => z.string().trim().max(max);
const editRequiredText = (max: number, label: string) =>
  z.string({ message: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

const editDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be a valid date')
  .transform((value) => new Date(value));

const studentEditSchema = z.object({
  surname: editRequiredText(80, 'Student surname').optional(),
  firstName: editRequiredText(80, 'Student first name').optional(),
  middleName: editText(80).optional(),
  dateOfBirth: editDate.optional(),
  gender: z.enum(['male', 'female'], { message: 'Gender must be male or female' }).optional(),
  religion: editText(60).optional(),
  ethnicity: editText(60).optional(),
  stateOfOrigin: editText(60).optional(),
  previousSchool: editText(120).optional(),
  lastClassAttended: editText(60).optional(),
});

const guardianEditSchema = z.object({
  name: editRequiredText(120, 'Parent or guardian name').optional(),
  homeAddress: editRequiredText(300, 'Home address').optional(),
  phone: z
    .string()
    .trim()
    .refine((value) => PHONE_PATTERN.test(normalisePhone(value)), 'must contain 7 to 15 digits')
    .optional(),
  email: editText(254).optional(),
  occupation: editText(80).optional(),
  officeAddress: editText(300).optional(),
});

const placementEditSchema = z.object({
  section: z.enum(['primary', 'secondary'], { message: 'Section must be primary or secondary' }).optional(),
  classApplyingFor: editRequiredText(60, 'Class applying for').optional(),
  academicSession: editRequiredText(40, 'Academic session').optional(),
});

export const applicationEditSchema = z.object({
  student: studentEditSchema.optional(),
  guardian: guardianEditSchema.optional(),
  placement: placementEditSchema.optional(),
  healthInformation: z
    .string()
    .trim()
    .max(1000, 'Health information must be at most 1000 characters')
    .optional()
    .transform((value) => (value === '' ? null : value)),
});

export type ApplicationEditInput = z.infer<typeof applicationEditSchema>;

/** Field-level errors in the shape the error envelope expects. */
export function toEditFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (path && !(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

/** True when the body names a field a PATCH is not allowed to change. */
export function findImmutableField(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  for (const field of IMMUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) return field;
  }

  return null;
}

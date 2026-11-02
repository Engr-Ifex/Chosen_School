/**
 * Zod schemas for the public admission submission.
 *
 * This is the **boundary**: everything arriving from the internet is untrusted
 * and is validated here before it reaches a service or a model. Mongoose
 * validates again as a backstop — the duplication is deliberate, because the
 * two are good at different things. Zod can say *which field* is wrong in a
 * form-friendly way; Mongoose guarantees nothing invalid is ever persisted,
 * whatever path wrote it.
 *
 * Limits mirror docs/DATA_MODEL.md §4.2 exactly. If one changes, both change.
 *
 * **Unknown keys are stripped, not rejected.** API_SPEC §2.6 and TEST_PLAN
 * API-P08 both require a client-supplied `submittedAt` to be ignored rather
 * than to fail the request, and the slice's acceptance criterion says the same.
 * Server-set fields are simply absent from this schema, so they cannot be
 * accepted even by accident.
 */

import { z } from 'zod';
import { PHONE_PATTERN } from '../lib/phone.js';

/** Treats "" as "not supplied" so an empty form field is not stored as a value. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const requiredText = (max: number, label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/**
 * Accepts an ISO date string (`2015-04-02`) or a full timestamp. A number is
 * rejected: it would be ambiguous between seconds and milliseconds.
 */
const isoDate = z
  .string({ message: 'Date of birth is required' })
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be a valid date')
  .transform((value) => new Date(value));

const studentSchema = z.object({
  surname: requiredText(80, 'Student surname'),
  firstName: requiredText(80, 'Student first name'),
  middleName: optionalText(80),
  dateOfBirth: isoDate,
  gender: z.enum(['male', 'female'], { message: 'Gender must be male or female' }),
  religion: optionalText(60),
  ethnicity: optionalText(60),
  stateOfOrigin: optionalText(60),
  previousSchool: optionalText(120),
  lastClassAttended: optionalText(60),
});

const guardianSchema = z.object({
  name: requiredText(120, 'Parent or guardian name'),
  homeAddress: requiredText(300, 'Home address'),
  phone: z
    .string({ message: 'Parent or guardian phone is required' })
    .transform((value) => value.replace(/\D/g, ''))
    .refine((digits) => PHONE_PATTERN.test(digits), 'must contain between 7 and 15 digits'),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: 'must be a valid email address',
    }),
  occupation: optionalText(80),
  officeAddress: optionalText(300),
});

const placementSchema = z.object({
  section: z.enum(['primary', 'secondary'], { message: 'Section must be primary or secondary' }),
  classApplyingFor: requiredText(60, 'Class applying for'),
  academicSession: requiredText(40, 'Academic session'),
});

const signatureSchema = z.object({
  // `signedAt` is deliberately absent: the server sets it. A client value is
  // dropped by the object schema and can never be honoured.
  typedName: requiredText(120, 'Typed signature'),
});

export const admissionInputSchema = z.object({
  student: studentSchema,
  guardian: guardianSchema,
  placement: placementSchema,
  signature: signatureSchema,
  healthInformation: optionalText(1000),
});

export type AdmissionInput = z.infer<typeof admissionInputSchema>;

/**
 * Converts a Zod failure into the field map the error envelope expects
 * (`{ "placement.classApplyingFor": "..." }`), so the form can highlight the
 * offending input rather than showing one generic message.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (path && !(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

/**
 * Admission submission.
 *
 * Business rules live here rather than in the route handler: the route parses
 * and shapes, this decides. That keeps the rules testable without HTTP, and
 * means a future admin-side create uses the same path.
 *
 * The cross-check against `settings` is the important part. A class name is
 * free text on the wire, so without this an attacker — or a stale cached form —
 * could write "Year 99" into the database and it would look like a real class.
 * The lists are school-managed data, so no class name is hardcoded here.
 */

import { AppError } from '../errors.js';
import { Application } from '../models/application.js';
import { SETTINGS_KEY, Settings } from '../models/settings.js';
import type { AdmissionInput } from '../schemas/admission.js';

export interface SubmittedApplication {
  id: string;
  submittedAt: Date;
}

export async function submitApplication(
  input: AdmissionInput,
  /** Injectable so tests can assert the server-set timestamp exactly. */
  now: Date = new Date(),
): Promise<SubmittedApplication> {
  const settings = await Settings.findOne({ key: SETTINGS_KEY });

  if (!settings) {
    // Without the settings document the class and session lists do not exist,
    // so no submission can be validated. Failing loudly beats accepting
    // anything, and 503 says "not my fault, try later" rather than blaming the
    // parent's form.
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'Admissions are not open at the moment. Please try again later.',
    );
  }

  const { primaryClasses, secondaryClasses, academicSessions } = settings.placement;
  const classesForSection =
    input.placement.section === 'primary' ? primaryClasses : secondaryClasses;

  if (!classesForSection.includes(input.placement.classApplyingFor)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', {
      'placement.classApplyingFor': `is not a class offered in the ${input.placement.section} section`,
    });
  }

  if (!academicSessions.includes(input.placement.academicSession)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', {
      'placement.academicSession': 'is not an academic session currently open for admission',
    });
  }

  const document = new Application({
    ...input,
    // Server-set, always. A client value never reaches here — the Zod schema
    // does not include `signedAt`, so it was already dropped.
    signature: { typedName: input.signature.typedName, signedAt: now },
    submittedAt: now,
    revisions: [],
    deletedAt: null,
    deletedBy: null,
  });

  const saved = await document.save();

  return { id: saved._id.toString(), submittedAt: saved.submittedAt };
}

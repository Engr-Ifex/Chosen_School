/**
 * Admission submission.
 *
 * Business rules live here rather than in the route handler: the route parses
 * and shapes, this decides.
 *
 * **Two things this service controls rather than accepts:**
 *
 *  1. `placement.academicSession` — administrator-controlled. The parent never
 *     supplies it and could not override it if they tried: the Zod schema does
 *     not include the field, and this service writes the configured value.
 *  2. `signature.signedAt` and `submittedAt` — server clock, always.
 *
 * It no longer reads `settings` to validate the class. The approved class list
 * is fixed school configuration (`config/school.ts`), so a fresh deployment
 * with an empty database accepts applications instead of returning 503.
 */

import { isValidClassForSection, resolveAcademicSession } from '../config/school.js';
import { AppError } from '../errors.js';
import { createLogger } from '../logger.js';
import { Application } from '../models/application.js';
import { SETTINGS_KEY, Settings } from '../models/settings.js';
import type { AdmissionInput } from '../schemas/admission.js';

const logger = createLogger('warn');

export interface SubmittedApplication {
  id: string;
  submittedAt: Date;
}

/**
 * The session to file the application under, set by the administrator.
 *
 * Best-effort: if `settings` is missing or unreadable we fall back to the
 * configured default rather than refusing the application. A parent cannot fix
 * a server configuration problem, so failing their submission would be wrong —
 * and the fallback is still school-controlled, never client-supplied.
 */
async function resolveSession(): Promise<string> {
  try {
    const settings = await Settings.findOne({ key: SETTINGS_KEY }).select('placement').lean();
    return resolveAcademicSession(settings?.placement?.currentSession);
  } catch (error) {
    logger.warn('admission_session_lookup_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return resolveAcademicSession(null);
  }
}

export async function submitApplication(
  input: AdmissionInput,
  /** Injectable so tests can assert the server-set timestamp exactly. */
  now: Date = new Date(),
): Promise<SubmittedApplication> {
  // Defence in depth. Zod has already rejected an unknown class at the
  // boundary; this guard means a direct call cannot bypass it either.
  if (!isValidClassForSection(input.placement.section, input.placement.classApplyingFor)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', {
      'placement.classApplyingFor': `is not a class offered in the ${input.placement.section} section`,
    });
  }

  const academicSession = await resolveSession();

  const document = new Application({
    ...input,
    placement: {
      section: input.placement.section,
      classApplyingFor: input.placement.classApplyingFor,
      // Overwrites anything the client might have slipped in.
      academicSession,
    },
    signature: { typedName: input.signature.typedName, signedAt: now },
    submittedAt: now,
    revisions: [],
    deletedAt: null,
    deletedBy: null,
  });

  const saved = await document.save();

  return { id: saved._id.toString(), submittedAt: saved.submittedAt };
}

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
import { getStorage } from '../lib/storage/index.js';
import { newPhotoKey, processPhoto } from './uploads.js';
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

export interface SubmitOptions {
  /** Raw uploaded bytes. Validated and re-encoded here, never stored as given. */
  photo?: Buffer;
  /** Injectable so tests can assert the server-set timestamp exactly. */
  now?: Date;
}

export async function submitApplication(
  input: AdmissionInput,
  options: SubmitOptions = {},
): Promise<SubmittedApplication> {
  const { photo, now = new Date() } = options;
  // Defence in depth. Zod has already rejected an unknown class at the
  // boundary; this guard means a direct call cannot bypass it either.
  if (!isValidClassForSection(input.placement.section, input.placement.classApplyingFor)) {
    throw new AppError('VALIDATION_ERROR', 'Some details need correcting.', {
      'placement.classApplyingFor': `is not a class offered in the ${input.placement.section} section`,
    });
  }

  const academicSession = await resolveSession();

  // The photo is processed and stored before the document is written, so a
  // rejected image never produces a record. If the save then fails, the stored
  // object is removed again — otherwise a retry would leave an orphan file that
  // nothing references.
  let stored: {
    key: string;
    contentType: string;
    width: number;
    height: number;
    bytes: number;
    uploadedAt: Date;
  } | null = null;

  if (photo) {
    const processed = await processPhoto(photo);
    const key = newPhotoKey();
    await getStorage().put(key, processed.data, processed.contentType);

    stored = {
      key,
      contentType: processed.contentType,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      uploadedAt: now,
    };
  }

  const document = new Application({
    ...input,
    placement: {
      section: input.placement.section,
      classApplyingFor: input.placement.classApplyingFor,
      // Overwrites anything the client might have slipped in.
      academicSession,
    },
    signature: { typedName: input.signature.typedName, signedAt: now },
    photo: stored,
    submittedAt: now,
    revisions: [],
    deletedAt: null,
    deletedBy: null,
  });

  try {
    const saved = await document.save();
    return { id: saved._id.toString(), submittedAt: saved.submittedAt };
  } catch (error) {
    if (stored) {
      await getStorage()
        .remove(stored.key)
        .catch(() => {
          // Best effort: the record was not written, so a leftover object is
          // unreferenced rather than a privacy problem. Never mask the original.
        });
    }
    throw error;
  }
}

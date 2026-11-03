/**
 * Public admission submission — `POST /api/v1/public/applications`.
 *
 * Contract: docs/API_SPEC.md §2.6.
 *
 * The response is deliberately minimal. The applicant has no account and no way
 * to authenticate, so returning the stored record would hand personal data to
 * anyone able to guess a response — and guessing is cheap when the reply is
 * echoed back in full. `id` and `submittedAt` are enough for the UI to show the
 * success message and for support to find the record.
 *
 * Two body shapes are accepted, because the form has two cases:
 *
 *  - `application/json` — no photo. The common path.
 *  - `multipart/form-data` — a photo attached. The JSON fields arrive as a
 *    `payload` part and the file as `photo`.
 *
 * The multipart file is held in memory, never on disk, so a rejected upload
 * leaves nothing behind. `limits.fileSize` stops Multer at 5 MB rather than
 * buffering an arbitrarily large body first.
 *
 * No authentication, by design: this is a public form. Abuse control is rate
 * limiting (S09), not auth.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError } from '../../errors.js';
import { admissionInputSchema, toFieldErrors } from '../../schemas/admission.js';
import { submitApplication } from '../../services/admissions.js';
import { MAX_PHOTO_BYTES } from '../../services/uploads.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 20 },
}).single('photo');

/** Normalises either body shape into `req.body` (an object) plus `req.file`. */
function parseBody(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }

  upload(req, res, (error: unknown) => {
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        next(new AppError('PAYLOAD_TOO_LARGE', 'The photo must be 5 MB or smaller.'));
        return;
      }
      next(new AppError('VALIDATION_ERROR', 'The upload could not be read.'));
      return;
    }

    const payload = (req.body as { payload?: unknown } | undefined)?.payload;
    if (typeof payload !== 'string') {
      next(new AppError('VALIDATION_ERROR', 'The form data was missing.'));
      return;
    }

    try {
      req.body = JSON.parse(payload) as unknown;
    } catch {
      next(new AppError('VALIDATION_ERROR', 'The form data could not be read.'));
      return;
    }

    next();
  });
}

export function publicApplicationsRouter(): Router {
  const router = Router();

  router.post('/applications', parseBody, async (req, res) => {
    const parsed = admissionInputSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Some details need correcting.',
        toFieldErrors(parsed.error),
      );
    }

    const { id, submittedAt } = await submitApplication(parsed.data, { photo: req.file?.buffer });

    res.status(201).json({
      id,
      submittedAt: submittedAt.toISOString(),
    });
  });

  return router;
}

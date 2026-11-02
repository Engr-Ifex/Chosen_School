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
 * No authentication, by design: this is a public form. Abuse control is rate
 * limiting (S09), not auth.
 */

import { Router } from 'express';
import { AppError } from '../../errors.js';
import { admissionInputSchema, toFieldErrors } from '../../schemas/admission.js';
import { submitApplication } from '../../services/admissions.js';

export function publicApplicationsRouter(): Router {
  const router = Router();

  router.post('/applications', async (req, res) => {
    const parsed = admissionInputSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Some details need correcting.',
        toFieldErrors(parsed.error),
      );
    }

    const { id, submittedAt } = await submitApplication(parsed.data);

    res.status(201).json({
      id,
      submittedAt: submittedAt.toISOString(),
    });
  });

  return router;
}

/**
 * Public enquiry and visit-request forms — `POST /api/v1/public/enquiries` and
 * `/visit-requests`. Contract: docs/API_SPEC.md §2.7.
 *
 * Same abuse controls as the admission form: origin check, then 5 per hour per
 * IP, both before the body is validated (API_SPEC §1.8). Each form has its own
 * counter, so a parent who sends an enquiry can still request a visit.
 *
 * The response is `{ id }` only. The visitor has no account, so echoing the
 * stored record back would hand their details to anyone who sees the reply.
 */

import { Router, type RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../../errors.js';
import { checkOriginAndCsrf } from '../../middleware/csrf.js';
import { byIp, LIMITS, rateLimit } from '../../middleware/rate-limit.js';
import { enquiryInputSchema, toFieldErrors, visitRequestInputSchema } from '../../schemas/inbox.js';
import { enquiries, visitRequests } from '../../services/inbox-kinds.js';

export interface PublicInboxOptions {
  appOrigin: string;
}

function submitHandler(
  schema: ZodType<Record<string, unknown>>,
  create: (input: Record<string, unknown>) => Promise<{ id: string }>,
): RequestHandler {
  return async (req, res) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Some details need correcting.',
        toFieldErrors(parsed.error),
      );
    }

    const { id } = await create(parsed.data);
    res.status(201).json({ id });
  };
}

export function publicInboxRouter(options: PublicInboxOptions): Router {
  const router = Router();
  const originOnly = checkOriginAndCsrf({ appOrigin: options.appOrigin, requireToken: false });

  router.post(
    '/enquiries',
    originOnly,
    rateLimit({ name: 'submit:enquiry', ...LIMITS.enquirySubmit, keyFor: byIp }),
    submitHandler(enquiryInputSchema, enquiries.create),
  );

  router.post(
    '/visit-requests',
    originOnly,
    rateLimit({ name: 'submit:visit', ...LIMITS.visitSubmit, keyFor: byIp }),
    submitHandler(visitRequestInputSchema, visitRequests.create),
  );

  return router;
}

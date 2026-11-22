/**
 * Admin inboxes — `/api/v1/admin/enquiries` and `/admin/visit-requests`.
 * Contract: docs/API_SPEC.md §4.4.
 *
 * Mounted behind the session guard, the admin rate limit and the CSRF/origin
 * check in `app.ts`, like every admin route. Controllers stay thin: parse,
 * call the service, return the shaped record.
 *
 * There is no `DELETE` here, on purpose. Archive is the only way out (Q11).
 */

import { Router } from 'express';
import { AppError } from '../../errors.js';
import {
  INBOX_SORTS,
  inboxListQuerySchema,
  statusUpdateSchema,
  toFieldErrors,
} from '../../schemas/inbox.js';
import { enquiries, visitRequests } from '../../services/inbox-kinds.js';

type Service = typeof enquiries | typeof visitRequests;

function mount(router: Router, base: string, service: Service, sorts: readonly string[]): void {
  const listQuery = inboxListQuerySchema(sorts);

  router.get(base, async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Some filters need correcting.', toFieldErrors(parsed.error));
    }
    res.status(200).json(await service.list(parsed.data));
  });

  router.get(`${base}/:id`, async (req, res) => {
    res.status(200).json(await service.get(String(req.params.id)));
  });

  router.patch(`${base}/:id`, async (req, res) => {
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Only the status can be changed.', toFieldErrors(parsed.error));
    }
    res.status(200).json(await service.setStatus(String(req.params.id), parsed.data.status));
  });

  router.post(`${base}/:id/archive`, async (req, res) => {
    res.status(200).json(await service.archive(String(req.params.id)));
  });

  router.post(`${base}/:id/unarchive`, async (req, res) => {
    res.status(200).json(await service.unarchive(String(req.params.id)));
  });
}

export function adminInboxRouter(): Router {
  const router = Router();
  mount(router, '/enquiries', enquiries, INBOX_SORTS.enquiries);
  mount(router, '/visit-requests', visitRequests, INBOX_SORTS.visitRequests);
  return router;
}

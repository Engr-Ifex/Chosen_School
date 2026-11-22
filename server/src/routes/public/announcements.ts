/**
 * Public news and events — `GET /api/v1/public/announcements` and
 * `/public/events`. Contract: docs/API_SPEC.md §2.4.
 *
 * Read-only and unauthenticated. What is visible is decided entirely by
 * `publicVisibilityFilter` in the model, via the service; nothing here adds or
 * removes a condition.
 */

import { Router } from 'express';
import { AppError } from '../../errors.js';
import { publicListQuerySchema, toFieldErrors } from '../../schemas/announcement.js';
import { listPublic } from '../../services/announcements.js';

export function publicAnnouncementsRouter(): Router {
  const router = Router();

  for (const [path, kind] of [
    ['/announcements', 'announcement'],
    ['/events', 'event'],
  ] as const) {
    router.get(path, async (req, res) => {
      const parsed = publicListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Some filters need correcting.', toFieldErrors(parsed.error));
      }
      // Public content changes when the admin publishes, so a short cache only.
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(200).json(await listPublic(kind, parsed.data));
    });
  }

  return router;
}

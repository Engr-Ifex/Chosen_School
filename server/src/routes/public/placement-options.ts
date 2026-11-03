/**
 * `GET /api/v1/public/placement-options` — docs/API_SPEC.md §2.3.
 *
 * **The class list does not touch the database.** It is served from
 * `config/school.ts`, so the admission form works on a fresh deployment with an
 * empty database. This endpoint previously returned 503 until a `settings`
 * document had been seeded, which left parents staring at an empty dropdown.
 *
 * The academic session is still administrator-controlled and read from
 * `settings` — but it is **best-effort**: a database problem degrades the
 * session hint, it does not break the class list. The parent form no longer
 * shows a session field, so this value is informational.
 *
 * Public by design: the school publishes these lists on its admission page.
 * No internal identifiers, contact details or admin data are included.
 */

import { Router } from 'express';
import {
  DEFAULT_ACADEMIC_SESSION,
  PRIMARY_CLASSES,
  SECONDARY_CLASSES,
  resolveAcademicSession,
} from '../../config/school.js';
import { createLogger } from '../../logger.js';
import { SETTINGS_KEY, Settings } from '../../models/settings.js';

const logger = createLogger('warn');

export function publicPlacementOptionsRouter(): Router {
  const router = Router();

  router.get('/placement-options', async (_req, res) => {
    let currentSession = DEFAULT_ACADEMIC_SESSION;

    try {
      const settings = await Settings.findOne({ key: SETTINGS_KEY }).select('placement').lean();
      currentSession = resolveAcademicSession(settings?.placement?.currentSession);
    } catch (error) {
      // Never let the session lookup take the class list down with it.
      logger.warn('placement_options_session_lookup_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    res.status(200).json({
      primary: [...PRIMARY_CLASSES],
      secondary: [...SECONDARY_CLASSES],
      sessions: [currentSession],
      currentSession,
    });
  });

  return router;
}

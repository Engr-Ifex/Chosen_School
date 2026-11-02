/**
 * `GET /api/v1/public/placement-options` — docs/API_SPEC.md §2.3.
 *
 * The admission form needs the class and session lists to populate its
 * selectors. They live in `settings` because the PRD forbids inventing class
 * names, so they are read from the database and never hardcoded here or in the
 * client.
 *
 * Added as a prerequisite of S04: without it the form cannot satisfy "section
 * choice drives the class list" except by hardcoding, which the PRD forbids.
 *
 * Public by design — the school publishes these lists on its admission page.
 * Nothing sensitive is included: no internal ids, no admin data, no contact
 * details (those belong to `/public/site`).
 */

import { Router } from 'express';
import { AppError } from '../../errors.js';
import { SETTINGS_KEY, Settings } from '../../models/settings.js';

export function publicPlacementOptionsRouter(): Router {
  const router = Router();

  router.get('/placement-options', async (_req, res) => {
    const settings = await Settings.findOne({ key: SETTINGS_KEY }).select('placement').lean();

    if (!settings) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Admissions are not open at the moment. Please try again later.',
      );
    }

    res.status(200).json({
      primary: settings.placement.primaryClasses ?? [],
      secondary: settings.placement.secondaryClasses ?? [],
      sessions: settings.placement.academicSessions ?? [],
      currentSession: settings.placement.currentSession ?? null,
    });
  });

  return router;
}

/**
 * Origin and CSRF protection — docs/SECURITY.md §8.
 *
 * Three independent checks, because each covers a gap in the others:
 *
 *  1. **Origin** must equal `APP_ORIGIN`. A browser sets it and a page cannot
 *     forge it, so it stops cross-site form posts outright.
 *  2. **`Sec-Fetch-Site`** must not be `cross-site`. Sent by modern browsers and
 *     not settable by script; covers requests where `Origin` is absent.
 *  3. **`X-CSRF-Token`** must match the session's token, compared in constant
 *     time. This is the backstop for anything the first two miss, and it is the
 *     only one that works if a browser omits both headers.
 *
 * A custom header alone is already strong — a cross-origin form cannot set one
 * without a preflight, and CORS is not enabled (ADR-015) — but relying on a
 * single mechanism is how these get quietly broken later.
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { constantTimeEquals } from '../lib/tokens.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CsrfOptions {
  appOrigin: string;
  /**
   * Public form endpoints are origin-checked but not token-checked: they are
   * unauthenticated, so there is no session to bind a token to.
   */
  requireToken: boolean;
}

export function checkOriginAndCsrf(options: CsrfOptions) {
  return function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const origin = req.get('origin');
    if (origin && origin !== options.appOrigin) {
      throw new AppError('FORBIDDEN', 'This request did not come from the school website.');
    }

    if (req.get('sec-fetch-site') === 'cross-site') {
      throw new AppError('FORBIDDEN', 'This request did not come from the school website.');
    }

    if (!options.requireToken || !MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    const supplied = req.get('x-csrf-token');
    if (!supplied || !req.auth) {
      throw new AppError('FORBIDDEN', 'Missing security token. Refresh the page and try again.');
    }

    if (!constantTimeEquals(supplied, req.auth.csrfToken)) {
      throw new AppError('FORBIDDEN', 'Missing security token. Refresh the page and try again.');
    }

    next();
  };
}

/**
 * Session authentication.
 *
 * Applied at the router, never per handler (ROADMAP S05 "Approach"): a route
 * added later cannot forget to authenticate if the middleware is already in
 * front of it.
 *
 * **Expiry is checked here on every request.** The TTL index on `expiresAt` is
 * housekeeping only — Mongo's TTL monitor runs about once a minute, so relying
 * on it would leave a window where an expired session still works.
 */

import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { AppError } from '../errors.js';
import { readCookie } from '../lib/session-cookie.js';
import { deriveCsrfToken, sha256 } from '../lib/tokens.js';
import { Admin } from '../models/admin.js';
import { Session } from '../models/session.js';

export interface AuthContext {
  adminId: Types.ObjectId;
  adminEmail: string;
  sessionId: Types.ObjectId;
  /** Derived from the session token; never stored. */
  csrfToken: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/** Sliding-window refresh is throttled to one write a minute, not one a request. */
const IDLE_REFRESH_INTERVAL_MS = 60_000;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export interface AuthOptions {
  sessionCookieName: string;
}

export function requireSession(options: AuthOptions) {
  return async function requireSessionMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = readCookie(req, options.sessionCookieName);

    // No cookie is not "expired" — the client has simply never signed in, and
    // the distinction decides whether the UI shows a sign-in screen or an
    // error.
    if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');

    const session = await Session.findOne({ tokenHash: sha256(token) });

    if (!session || session.revokedAt) {
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    }

    const now = Date.now();

    if (session.expiresAt.getTime() <= now || session.idleExpiresAt.getTime() <= now) {
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }

    const admin = await Admin.findById(session.adminId);

    if (!admin) {
      // The account was removed while the session existed. Treat as
      // unauthenticated rather than trusting a session with no owner.
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    }

    if (now - session.lastSeenAt.getTime() > IDLE_REFRESH_INTERVAL_MS) {
      session.lastSeenAt = new Date(now);
      session.idleExpiresAt = new Date(now + IDLE_TIMEOUT_MS);
      await session.save();
    }

    req.auth = {
      adminId: session.adminId,
      adminEmail: admin.email,
      sessionId: session._id,
      csrfToken: deriveCsrfToken(token),
      expiresAt: session.expiresAt,
      idleExpiresAt: session.idleExpiresAt,
    };

    next();
  };
}

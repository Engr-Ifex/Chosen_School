/**
 * Rate limiting backed by Atlas (ADR-033, ARCHITECTURE §7.5, API_SPEC §1.8).
 *
 * Not process memory: Render restarts the process freely, and an in-memory
 * limiter that forgets on restart is worse than none — it looks like
 * protection.
 *
 * **One atomic operation per attempt.** The counter is reset-or-incremented in
 * a single `findOneAndUpdate` with an aggregation-pipeline update, and the
 * decision is made from the value that operation returns. An earlier version
 * read the count and then wrote it in a second call, so N requests arriving
 * together could all read "4" and all be allowed — which is exactly how a
 * login brute-force would be sent.
 *
 * Fixed window. The TTL index on `expiresAt` is housekeeping; the window is
 * decided by comparing `windowStart`, for the same reason sessions never trust
 * the TTL monitor.
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import { RateLimit } from '../models/ratelimit.js';

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

/** Duplicate-key error code, raised when two first attempts race to insert. */
const DUPLICATE_KEY = 11000;

/**
 * Records one attempt against `key` and reports whether it is allowed.
 *
 * Every call counts, including blocked ones. That cannot extend the window —
 * it is fixed from `windowStart` — so a client hammering a closed limit is
 * still released on schedule.
 *
 * @param key      Namespaced counter, e.g. `login:ip:203.0.113.7`.
 * @param windowMs Length of the fixed window.
 * @param max      Attempts permitted inside one window.
 */
export async function consumeLimit(
  key: string,
  windowMs: number,
  max: number,
): Promise<LimitResult> {
  const now = new Date();
  const windowFloor = new Date(now.getTime() - windowMs);
  const nextExpiry = new Date(now.getTime() + windowMs);

  // True when there is no live window: the document is new (no
  // `windowStart`) or its window has ended.
  const expired = {
    $lte: [{ $ifNull: ['$windowStart', new Date(0)] }, windowFloor],
  };

  const update = [
    {
      $set: {
        key,
        count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
        windowStart: { $cond: [expired, now, '$windowStart'] },
        expiresAt: { $cond: [expired, nextExpiry, '$expiresAt'] },
      },
    },
  ];

  const run = () =>
    // The native collection, not the Mongoose model: Mongoose's casting of
    // pipeline updates is not something this needs to depend on.
    RateLimit.collection.findOneAndUpdate({ key }, update, {
      upsert: true,
      returnDocument: 'after',
      projection: { count: 1, windowStart: 1 },
    });

  let doc;
  try {
    doc = await run();
  } catch (error) {
    // Two first attempts can both try to insert; the unique index on `key`
    // rejects one. Retrying turns it into an increment of the winner's row.
    if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    doc = await run();
  }

  if (!doc) {
    // Unreachable with `upsert` + `returnDocument: 'after'`. Fail closed
    // rather than let an unexplained result through.
    throw new Error('rate limit update returned no document');
  }

  const count = Number(doc.count);
  if (count <= max) return { allowed: true, retryAfterSeconds: 0 };

  const windowStart = (doc.windowStart as Date).getTime();
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now.getTime()) / 1000)),
  };
}

/**
 * Clears a counter. Called on successful login so a legitimate administrator
 * who mistyped a few times is not left throttled.
 */
export async function resetLimit(key: string): Promise<void> {
  await RateLimit.deleteOne({ key });
}

/**
 * The approved limits — API_SPEC §1.8. One table, so a number cannot drift
 * between the route that enforces it and the test that checks it.
 */
export const LIMITS = {
  applicationSubmit: { windowMs: 60 * 60 * 1000, max: 5 },
  enquirySubmit: { windowMs: 60 * 60 * 1000, max: 5 },
  visitSubmit: { windowMs: 60 * 60 * 1000, max: 5 },
  adminPdf: { windowMs: 60 * 60 * 1000, max: 20 },
  adminRequests: { windowMs: 60 * 60 * 1000, max: 600 },
} as const;

export interface RateLimitOptions {
  /** Short namespace for the counter key, e.g. `submit:application`. */
  name: string;
  windowMs: number;
  max: number;
  /**
   * What the limit is counted against — an IP or a session id. Never a value
   * the client chose, and never personal data beyond what DATA_MODEL §13a
   * allows.
   */
  keyFor: (req: Request) => string;
}

/**
 * Middleware form of {@link consumeLimit}. Rejects with `429 RATE_LIMITED` and
 * a `Retry-After` header once the window is used up.
 *
 * Place it **before** anything expensive — body parsing of uploads, database
 * reads, PDF rendering — so a flood is turned away cheaply.
 */
export function rateLimit(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const key = `${options.name}:${options.keyFor(req)}`;
    const result = await consumeLimit(key, options.windowMs, options.max);

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError('RATE_LIMITED', 'Too many requests. Please wait and try again.');
    }

    next();
  };
}

/** Counter suffix for an IP-keyed limit. Relies on `trust proxy` (§5.3, T3). */
export const byIp = (req: Request): string => `ip:${req.ip ?? 'unknown'}`;

/**
 * Counter suffix for a session-keyed limit. Must run after `requireSession`;
 * without a session there is nothing to key on, which is a wiring bug, not a
 * client error.
 */
export const bySession = (req: Request): string => {
  if (!req.auth) throw new Error('bySession used before requireSession');
  return `session:${req.auth.sessionId.toString()}`;
};

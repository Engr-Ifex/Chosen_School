/**
 * Rate limiting backed by Atlas (ADR-033, ARCHITECTURE §7.5).
 *
 * Not process memory: Render restarts the process freely, and an in-memory
 * limiter that forgets on restart is worse than none — it looks like
 * protection.
 *
 * Fixed window: one `$inc` and one read per attempt. The TTL index on
 * `expiresAt` is housekeeping; the window is decided by comparing `windowStart`,
 * for the same reason sessions never trust the TTL monitor.
 */

import { RateLimit } from '../models/ratelimit.js';

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

/**
 * Records one attempt against `key` and reports whether it is allowed.
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
  const now = Date.now();
  const existing = await RateLimit.findOne({ key }).lean();

  const windowExpired =
    !existing || existing.windowStart.getTime() + windowMs <= now;

  if (windowExpired) {
    await RateLimit.updateOne(
      { key },
      {
        $set: {
          count: 1,
          windowStart: new Date(now),
          expiresAt: new Date(now + windowMs),
        },
      },
      { upsert: true },
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.windowStart.getTime() + windowMs - now) / 1000),
      ),
    };
  }

  await RateLimit.updateOne({ key }, { $inc: { count: 1 } });
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Clears a counter. Called on successful login so a legitimate administrator
 * who mistyped a few times is not left throttled.
 */
export async function resetLimit(key: string): Promise<void> {
  await RateLimit.deleteOne({ key });
}

/**
 * `ratelimits` — counters that survive a restart (docs/DATA_MODEL.md §13a,
 * ADR-033).
 *
 * Why not process memory: Render may restart the process at any time, which
 * would silently reset every limit. A limiter that forgets is worse than none,
 * because it looks like protection.
 *
 * Fixed window rather than sliding: one atomic `$inc` and one read. The failure
 * mode — a burst straddling a window boundary — is acceptable for login and far
 * cheaper than a document per attempt.
 */

import { Schema, model } from 'mongoose';

export interface RateLimitShape {
  /** Namespaced, e.g. `login:ip:203.0.113.7` or `login:email:a@b.test`. */
  key: string;
  count: number;
  windowStart: Date;
  /** `windowStart + window`. Housekeeping only — never used to decide. */
  expiresAt: Date;
}

const rateLimitSchema = new Schema<RateLimitShape>(
  {
    key: { type: String, required: true, maxlength: 320 },
    count: { type: Number, required: true, default: 0, min: 0 },
    windowStart: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: 'ratelimits',
    autoIndex: false,
  },
);

rateLimitSchema.index({ key: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = model<RateLimitShape>('RateLimit', rateLimitSchema);

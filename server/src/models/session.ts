/**
 * `sessions` — server-side session records (docs/DATA_MODEL.md §3).
 *
 * Sessions are stored server-side so that revocation is a database write rather
 * than waiting for a token to expire. The cookie holds a random token; only its
 * SHA-256 is stored, so a database read does not yield a usable credential.
 *
 * The TTL index is **housekeeping only**. Mongo's TTL monitor runs about once a
 * minute, so an expired session can still be present. The application must check
 * `expiresAt` and `idleExpiresAt` on every request; relying on the TTL index for
 * correctness would leave a window where an expired session still works.
 */

import { Schema, model, type Types } from 'mongoose';

export interface SessionShape {
  tokenHash: string;
  adminId: Types.ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  /** Absolute ceiling: created + 12h. */
  expiresAt: Date;
  /** Sliding idle window: lastSeen + 60m. */
  idleExpiresAt: Date;
  revokedAt?: Date | null;
  ip?: string | null;
  userAgent?: string | null;
}

const sessionSchema = new Schema<SessionShape>(
  {
    tokenHash: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    // Personal data. Truncated, and never logged in full (SECURITY.md §12).
    ip: { type: String, default: null, maxlength: 45 },
    userAgent: { type: String, default: null, maxlength: 255 },
  },
  {
    collection: 'sessions',
    autoIndex: false,
  },
);

// DB-02 — duplicate token hashes must be impossible.
sessionSchema.index({ tokenHash: 1 }, { unique: true });

// Housekeeping only; see the note above.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.index({ adminId: 1, revokedAt: 1 });

export const Session = model<SessionShape>('Session', sessionSchema);

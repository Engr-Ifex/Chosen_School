/**
 * Tokens: generation, hashing, and comparison.
 *
 * Two rules, both load-bearing:
 *
 *  1. **The raw token is never stored.** Only its SHA-256 goes in the database,
 *     so a database read does not yield a usable credential. The cookie carries
 *     the raw value; the server hashes what arrives and looks that up.
 *  2. **Comparison is constant time.** A byte-by-byte compare that exits early
 *     leaks how much of a guessed token was correct, which is enough to walk a
 *     token out one character at a time.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes of CSPRNG output, base64url — 256 bits, URL and cookie safe. */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256, hex. Used for session and CSRF tokens, never for passwords. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` throws on differing lengths, and the throw itself leaks
 * length — so both sides are hashed first, making every comparison 32 bytes
 * regardless of input. Comparing digests is also what makes this safe for
 * variable-length CSRF tokens.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

/**
 * The per-session CSRF token, derived from the session token.
 *
 * Derived rather than stored because `GET /auth/session` has to return it: a
 * stored hash could not be handed back, and a stored raw value would put a
 * second credential in the database. Another origin cannot read the `HttpOnly`
 * cookie, so it cannot derive this.
 */
export function deriveCsrfToken(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('csrf-v1').digest('base64url');
}

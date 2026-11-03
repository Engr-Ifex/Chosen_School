/**
 * Authentication endpoints — docs/API_SPEC.md §3.
 *
 * The design decisions that matter most, and why:
 *
 *  - **Every failure is the same 401 with the same message.** Unknown email,
 *    wrong password, and a locked account are indistinguishable to the client.
 *    Anything else is an account-enumeration oracle.
 *  - **An unknown email still costs a password hash.** `burnPasswordTime` runs
 *    a real Argon2 verification against a dummy hash, so response time does not
 *    reveal whether the account exists — the generic message would otherwise be
 *    undermined by a 50 ms difference.
 *  - **Rate limiting is checked before the database lookup**, so a flood cannot
 *    be used to hammer Atlas or to enumerate by timing.
 *  - **The session token is random and only its hash is stored.** A database
 *    read yields no usable credential.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { burnPasswordTime, verifyPassword } from '../lib/password.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session-cookie.js';
import { createToken, deriveCsrfToken, sha256 } from '../lib/tokens.js';
import { requireSession } from '../middleware/auth.js';
import { checkOriginAndCsrf } from '../middleware/csrf.js';
import { consumeLimit, resetLimit } from '../middleware/rate-limit.js';
import { Admin } from '../models/admin.js';
import { AuditLog, type AuditAction } from '../models/auditlog.js';
import { Session } from '../models/session.js';

/** 5 failures per 15 minutes, per IP and per email (ARCHITECTURE §7.5). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // ADR: absolute ceiling
const SESSION_IDLE_MS = 60 * 60 * 1000; // ADR-027: sliding idle window

/** Same message for every failure, by design. */
const GENERIC_AUTH_MESSAGE = 'The email address or password is incorrect.';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'must be a valid email address'),
  password: z.string().min(1).max(200),
});

export interface AuthRouterOptions {
  appOrigin: string;
  sessionCookieName: string;
  isProduction: boolean;
}

const truncate = (value: string, max: number): string => value.slice(0, max);

async function audit(
  action: AuditAction,
  actorId: string | null,
  req: { ip?: string; get(name: string): string | undefined },
  meta: Record<string, string | number | boolean> | null,
): Promise<void> {
  try {
    await AuditLog.create({
      at: new Date(),
      actorId: actorId ?? null,
      action,
      targetType: null,
      targetId: null,
      ip: truncate(req.ip ?? '', 45) || null,
      userAgent: truncate(req.get('user-agent') ?? '', 255) || null,
      meta,
    });
  } catch {
    // An audit write must never take down the request it is describing.
  }
}

export function authRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const cookieConfig = { name: options.sessionCookieName, isProduction: options.isProduction };
  const sessionGuard = requireSession({ sessionCookieName: options.sessionCookieName });
  // Login is origin-checked but not token-checked: there is no session yet, so
  // there is no CSRF token to compare against. The origin check is what stops a
  // cross-site login attempt (login CSRF).
  const originOnly = checkOriginAndCsrf({ appOrigin: options.appOrigin, requireToken: false });
  const originAndCsrf = checkOriginAndCsrf({ appOrigin: options.appOrigin, requireToken: true });

  router.post('/login', originOnly, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Enter your email address and password.');
    }

    const { email, password } = parsed.data;
    const ip = req.ip ?? 'unknown';

    const ipKey = `login:ip:${ip}`;
    const emailKey = `login:email:${email}`;

    // Both counters are consumed on every attempt — that is what makes the
    // limit apply to attempts rather than to successes.
    const ipLimit = await consumeLimit(ipKey, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);
    const emailLimit = await consumeLimit(emailKey, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);

    if (!ipLimit.allowed || !emailLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
      res.setHeader('Retry-After', String(retryAfter));
      await audit('auth.login.failure', null, req, { reason: 'rate_limited' });
      throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.');
    }

    // `String(...)` rather than passing the parsed value straight in: a raw
    // object could carry `$ne` and match the first document (SECURITY §9).
    const admin = await Admin.findOne({ email: String(email) }).select('+passwordHash');

    if (!admin) {
      await burnPasswordTime(password);
      await audit('auth.login.failure', null, req, { reason: 'unknown_account' });
      throw new AppError('UNAUTHENTICATED', GENERIC_AUTH_MESSAGE);
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      await burnPasswordTime(password);
      await audit('auth.login.failure', admin._id.toString(), req, { reason: 'locked' });
      // Not disclosed: a lockout message would confirm the account exists.
      throw new AppError('UNAUTHENTICATED', GENERIC_AUTH_MESSAGE);
    }

    const passwordOk = await verifyPassword(admin.passwordHash, password);

    if (!passwordOk) {
      admin.failedLoginCount += 1;
      if (admin.failedLoginCount >= LOGIN_MAX_ATTEMPTS) {
        admin.lockedUntil = new Date(Date.now() + LOGIN_WINDOW_MS);
        admin.failedLoginCount = 0;
      }
      await admin.save();
      await audit('auth.login.failure', admin._id.toString(), req, { reason: 'bad_password' });
      throw new AppError('UNAUTHENTICATED', GENERIC_AUTH_MESSAGE);
    }

    // Success. Clear both the counters and the lockout so a legitimate
    // administrator who mistyped is not left throttled.
    admin.failedLoginCount = 0;
    admin.lockedUntil = null;
    admin.lastLoginAt = new Date();
    await admin.save();
    await Promise.all([resetLimit(ipKey), resetLimit(emailKey)]);

    const token = createToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
    const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_MS);

    await Session.create({
      tokenHash: sha256(token),
      adminId: admin._id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      idleExpiresAt,
      revokedAt: null,
      ip: truncate(ip, 45),
      userAgent: truncate(req.get('user-agent') ?? '', 255),
    });

    await audit('auth.login.success', admin._id.toString(), req, null);

    setSessionCookie(res, token, expiresAt, cookieConfig);

    res.status(200).json({
      admin: { email: admin.email },
      csrfToken: deriveCsrfToken(token),
      expiresAt: expiresAt.toISOString(),
    });
  });

  router.post('/logout', sessionGuard, originAndCsrf, async (req, res) => {
    // Deleting the row is what makes logout immediate: the cookie is only a
    // lookup key, so removing the session invalidates it everywhere at once.
    await Session.deleteOne({ _id: req.auth?.sessionId });
    await audit('auth.logout', req.auth?.adminId.toString() ?? null, req, null);

    clearSessionCookie(res, cookieConfig);
    res.status(204).end();
  });

  router.get('/session', sessionGuard, (req, res) => {
    res.status(200).json({
      admin: { email: req.auth?.adminEmail },
      csrfToken: req.auth?.csrfToken,
      expiresAt: req.auth?.expiresAt.toISOString(),
      idleExpiresAt: req.auth?.idleExpiresAt.toISOString(),
    });
  });

  return router;
}

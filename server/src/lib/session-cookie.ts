/**
 * The session cookie, isolated in one module.
 *
 * ROADMAP S05 flags the cookie design as **unverified until S07** — whether a
 * `__Host-` cookie survives the real Vercel → Render arrangement is not yet
 * proven (TEST_PLAN T1/T4). Keeping every attribute decision here means that if
 * S07 disproves it, the change is local rather than a hunt through middleware.
 *
 * ADR-016: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`,
 * no `Domain`. The prefix is enforced by the browser — it rejects the cookie if
 * any of those attributes is wrong, so a misconfiguration fails visibly instead
 * of silently weakening the cookie.
 */

import type { Request, Response } from 'express';

export interface CookieConfig {
  name: string;
  isProduction: boolean;
}

/**
 * `__Host-` cookies MUST carry `Secure`; a browser silently discards one that
 * does not. So the prefix forces `Secure` on even outside production —
 * `localhost` is treated as a secure context by browsers, which is what makes
 * this workable in development.
 */
function requiresSecure(name: string, isProduction: boolean): boolean {
  return isProduction || name.startsWith('__Host-');
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  config: CookieConfig,
): void {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  res.cookie(config.name, token, {
    httpOnly: true,
    secure: requiresSecure(config.name, config.isProduction),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  });
}

/**
 * Clearing must use the same attributes, or the browser keeps the original.
 * Expiring it to the epoch is more reliable across browsers than deleting by
 * name alone.
 */
export function clearSessionCookie(res: Response, config: CookieConfig): void {
  res.clearCookie(config.name, {
    httpOnly: true,
    secure: requiresSecure(config.name, config.isProduction),
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Reads one cookie without pulling in `cookie-parser` for a single name.
 * Returns `undefined` rather than throwing on a malformed header.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;

    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return undefined;
}

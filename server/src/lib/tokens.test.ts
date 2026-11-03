import { describe, expect, it } from 'vitest';
import { constantTimeEquals, createToken, deriveCsrfToken, sha256 } from './tokens.js';

describe('createToken', () => {
  it('returns 32 bytes of base64url', () => {
    const token = createToken();
    // 32 bytes -> 43 base64url characters, no padding.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('sha256', () => {
  it('is stable and hex', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different input', () => {
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
});

describe('constantTimeEquals', () => {
  it('is true for equal strings', () => {
    expect(constantTimeEquals('token-value', 'token-value')).toBe(true);
  });

  it('is false for different strings', () => {
    expect(constantTimeEquals('token-value', 'token-valuf')).toBe(false);
  });

  it('handles differing lengths without throwing', () => {
    // timingSafeEqual throws on length mismatch, which would itself leak
    // length. Both sides are hashed first so this cannot happen.
    expect(constantTimeEquals('short', 'a-much-longer-value')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('deriveCsrfToken', () => {
  it('is stable for the same session token', () => {
    const session = createToken();
    expect(deriveCsrfToken(session)).toBe(deriveCsrfToken(session));
  });

  it('differs between sessions', () => {
    expect(deriveCsrfToken(createToken())).not.toBe(deriveCsrfToken(createToken()));
  });

  it('does not reveal the session token', () => {
    const session = createToken();
    const csrf = deriveCsrfToken(session);

    expect(csrf).not.toBe(session);
    expect(csrf).not.toContain(session);
    // Not a plain hash either — it is keyed on the session token.
    expect(csrf).not.toBe(sha256(session));
  });
});

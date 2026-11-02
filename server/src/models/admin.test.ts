/**
 * Admin schema — the credential fields must never reach a response.
 *
 * `select: false` protects queries; the `toJSON` transform protects everything
 * else. Both are asserted, because the second exists specifically for the case
 * where the first was bypassed.
 */

import { describe, expect, it } from 'vitest';
import { Admin } from './admin.js';

function validAdmin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'Admin@Example.test',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
    passwordAlgo: 'argon2id',
    passwordParams: { memoryCost: 65536, timeCost: 3, parallelism: 4 },
    passwordUpdatedAt: new Date('2026-10-24T09:00:00.000Z'),
    ...overrides,
  };
}

describe('Admin schema', () => {
  it('lowercases and trims the email', () => {
    const document = new Admin(validAdmin({ email: '  Admin@Example.TEST  ' }));
    expect(document.email).toBe('admin@example.test');
  });

  it('defaults failedLoginCount to 0', () => {
    expect(new Admin(validAdmin()).failedLoginCount).toBe(0);
  });

  it('marks the credential fields select:false', () => {
    expect(Admin.schema.path('passwordHash')?.options.select).toBe(false);
    expect(Admin.schema.path('passwordParams')?.options.select).toBe(false);
  });

  it('removes credential fields from toJSON', () => {
    const document = new Admin(validAdmin());
    const json = document.toJSON() as unknown as Record<string, unknown>;

    expect(json.passwordHash).toBeUndefined();
    expect(json.passwordParams).toBeUndefined();
    expect(json.email).toBe('admin@example.test');
  });
});

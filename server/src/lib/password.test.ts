import { describe, expect, it } from 'vitest';
import { burnPasswordTime, hashPassword, verifyPassword, DEFAULT_PARAMS } from './password.js';

describe('password hashing', () => {
  it('produces an Argon2id hash, never the password', async () => {
    const result = await hashPassword('correct horse battery staple');

    expect(result.hash.startsWith('$argon2id$')).toBe(true);
    expect(result.hash).not.toContain('correct horse');
    expect(result.algo).toBe('argon2id');
  });

  it('records the parameters used, so the cost can be raised later', async () => {
    const result = await hashPassword('correct horse battery staple');
    expect(result.params).toEqual(DEFAULT_PARAMS);
  });

  it('verifies the correct password', async () => {
    const result = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(result.hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const result = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(result.hash, 'Correct horse battery staple')).resolves.toBe(false);
    await expect(verifyPassword(result.hash, '')).resolves.toBe(false);
  });

  it('salts each hash, so two identical passwords differ', async () => {
    const first = await hashPassword('same-password-twice');
    const second = await hashPassword('same-password-twice');

    expect(first.hash).not.toBe(second.hash);
    await expect(verifyPassword(second.hash, 'same-password-twice')).resolves.toBe(true);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    // A corrupt record must not crash a login request.
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('burns comparable time for an unknown account without throwing', async () => {
    await expect(burnPasswordTime('some-password')).resolves.toBeUndefined();
  });
});

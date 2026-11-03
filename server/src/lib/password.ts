/**
 * Password hashing — Argon2id (ADR-017, docs/SECURITY.md §6.1).
 *
 * Parameters are stored **with** each hash rather than read from configuration
 * at verification time. That is what allows the cost to be raised later without
 * invalidating existing passwords: an old hash keeps the parameters it was made
 * with, and can be re-hashed on next successful login.
 *
 * The binding is `@node-rs/argon2`, which ships prebuilt binaries. The pure
 * `argon2` package needs a node-gyp toolchain, and SECURITY.md lists native
 * build failure as a known risk (A-06) — a prebuilt binary removes it.
 */

import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Argon2id. Declared numerically because the binding exports `Algorithm` as an
 * ambient const enum, and `verbatimModuleSyntax` forbids accessing those.
 */
const ARGON2ID = 2;

export interface PasswordParams {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/**
 * OWASP baseline for Argon2id: 19 MiB, 2 iterations, 1 lane.
 * Raising these is a security improvement; lowering them is a regression that
 * should require a decision record.
 */
export const DEFAULT_PARAMS: PasswordParams = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export interface HashedPassword {
  hash: string;
  algo: 'argon2id';
  params: PasswordParams;
}

export async function hashPassword(
  password: string,
  params: PasswordParams = DEFAULT_PARAMS,
): Promise<HashedPassword> {
  const hash = await argonHash(password, {
    algorithm: ARGON2ID,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  });

  return { hash, algo: 'argon2id', params };
}

/**
 * Verifies a password against a stored hash. Returns false rather than throwing
 * on a malformed hash, so a corrupt record cannot crash a login request.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * A real Argon2id hash of a value nobody knows, used to keep the timing of
 * "no such account" and "wrong password" indistinguishable.
 *
 * Without this, an unknown email returns in microseconds while a known one
 * spends ~50 ms hashing — a reliable account-enumeration oracle that the
 * generic error message would not hide. Computed once at module load.
 */
let dummyHashPromise: Promise<HashedPassword> | null = null;

export async function burnPasswordTime(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword('not-a-real-password-placeholder');
  const dummy = await dummyHashPromise;
  await verifyPassword(dummy.hash, password);
}

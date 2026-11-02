/**
 * Phone handling.
 *
 * Stored normalised (digits only), displayed formatted. Storing what the parent
 * typed would make `search.guardianPhone` unindexable — "+234 803 123 4567" and
 * "08031234567" are the same number and must match the same query.
 *
 * No country logic is applied: the PRD defines no default region, and inventing
 * one would silently rewrite a number the parent entered correctly.
 */

/** Strips everything that is not a digit. Idempotent. */
export function normalisePhone(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * E.164 allows up to 15 digits; 7 is the shortest plausible national number.
 * Deliberately permissive: rejecting a valid Nigerian number is worse than
 * accepting an odd one.
 */
export const PHONE_PATTERN = /^\d{7,15}$/;

export function isValidPhone(normalised: string): boolean {
  return PHONE_PATTERN.test(normalised);
}

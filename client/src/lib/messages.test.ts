import { describe, expect, it } from 'vitest';
import { SUBMISSION_SUCCESS_MESSAGE } from './messages';

/**
 * The exact wording is a product promise (PRD §7, DESIGN.md §4.5). This test
 * exists so the string cannot be "improved" in one place and not the other —
 * the assertion below is the only other copy in the codebase.
 */
describe('submission success message', () => {
  it('matches the approved wording exactly', () => {
    expect(SUBMISSION_SUCCESS_MESSAGE).toBe(
      'Your admission application has been submitted successfully.',
    );
  });

  it('has no trailing whitespace or punctuation drift', () => {
    expect(SUBMISSION_SUCCESS_MESSAGE).toBe(SUBMISSION_SUCCESS_MESSAGE.trim());
    expect(SUBMISSION_SUCCESS_MESSAGE.endsWith('.')).toBe(true);
    expect(SUBMISSION_SUCCESS_MESSAGE).not.toContain('!');
  });
});

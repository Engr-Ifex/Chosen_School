/**
 * User-facing copy that must not be paraphrased.
 *
 * The success line is specified verbatim in docs/PRD.md and docs/DESIGN.md
 * §4.5. It lives here as a single constant so the component and the test refer
 * to the same string: if someone edits the wording, the test fails rather than
 * the two quietly diverging.
 */

/** PRD §7 / DESIGN.md §4.5 — exact wording, do not reword. */
export const SUBMISSION_SUCCESS_MESSAGE =
  'Your admission application has been submitted successfully.';

/**
 * Shown when the outcome is genuinely unknown (network failure, timeout).
 * Deliberately does **not** claim success or failure, because either claim
 * could be wrong and one of them causes a duplicate application.
 */
export const SUBMISSION_UNKNOWN_MESSAGE =
  "We couldn't confirm whether your application was received. Please check your connection and try again.";

/**
 * Contact enquiry confirmation (FR-023, DESIGN.md §5.3). States that the
 * message was received and that follow-up is manual. It promises no response
 * time and no automatic reply, because neither exists.
 */
export const ENQUIRY_SUCCESS_MESSAGE =
  'Your enquiry has been received. The school will follow up with you directly.';

/**
 * Visit-request confirmation (FR-024, PRD §5.4, DESIGN.md §4.8). It must say
 * the request was **received** and is **not yet a confirmed visit**. Booking
 * language here would promise an appointment the school has not made.
 */
export const VISIT_REQUEST_SUCCESS_MESSAGE =
  'Your visit request has been received. This is not yet a confirmed visit — the school will contact you to confirm a time or suggest another.';

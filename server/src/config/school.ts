/**
 * Approved school configuration — the single source of truth for class names.
 *
 * **Why this is code and not a database field.** The class list used to live in
 * `settings.placement`, which meant the public admission form could not render
 * until someone had seeded a document — a parent saw "we could not load the
 * classes" on a fresh deployment. The school has now supplied the definitive
 * list, so it is fixed data, not admin-managed content: putting it in code
 * removes the seeding dependency entirely and makes frontend and backend
 * impossible to disagree, because both read the same array.
 *
 * `settings.placement.primaryClasses` / `secondaryClasses` are therefore no
 * longer read for validation. They are left in the schema to avoid a data
 * migration; see docs/DATA_MODEL.md §12.
 *
 * **Order matters.** The lists are rendered in this order in the dropdown, and
 * it is the school's order: PG first, then KG, then Basic. Do not sort them
 * alphabetically — "Basic 1" would land before "KG1".
 *
 * Changing this file is a school-policy change, not a refactor.
 */

export const PRIMARY_CLASSES = [
  'PG',
  'KG1',
  'KG2',
  'Basic 1',
  'Basic 2',
  'Basic 3',
  'Basic 4',
  'Basic 5',
] as const;

export const SECONDARY_CLASSES = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;

export type Section = 'primary' | 'secondary';

export const CLASSES_BY_SECTION: Record<Section, readonly string[]> = {
  primary: PRIMARY_CLASSES,
  secondary: SECONDARY_CLASSES,
};

/**
 * True only when the class belongs to the given section.
 *
 * One function used by both the Zod boundary and the service, so the two can
 * never drift into disagreeing about what a valid class is.
 */
export function isValidClassForSection(section: string, className: string): boolean {
  if (section !== 'primary' && section !== 'secondary') return false;
  return CLASSES_BY_SECTION[section].includes(className);
}

/**
 * Academic session is **administrator-controlled**, never parent-supplied.
 *
 * The admin value lives in `settings.placement.currentSession`. This constant is
 * only the bootstrap value used before an administrator has set one, so that a
 * submission is never rejected for a reason the parent cannot fix.
 *
 * It must be reviewed when the school year rolls over. There is no admin screen
 * to change it yet — that arrives with the admin settings work, and until then
 * this constant is the only way to move the session on.
 */
export const DEFAULT_ACADEMIC_SESSION = '2026/2027';

/** Resolves the session an application is filed under. Never from the client. */
export function resolveAcademicSession(configured: string | null | undefined): string {
  const trimmed = (configured ?? '').trim();
  return trimmed === '' ? DEFAULT_ACADEMIC_SESSION : trimmed;
}

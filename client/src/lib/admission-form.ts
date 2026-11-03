/**
 * Form state and payload building, kept out of the component.
 *
 * Why: the mapping from a flat form to the nested API body is the part most
 * likely to drift from `server/src/schemas/admission.ts`, and it is the part
 * worth testing directly. The component should only render and wire events.
 *
 * **Validation rules are deliberately not duplicated here.** The server owns
 * the limits and returns them as a `fields` map keyed by dotted path, which
 * the form renders against the matching input. Writing the same limits twice
 * is how the two quietly disagree — one side accepts what the other rejects,
 * and nobody notices until a parent is stuck.
 *
 * The only checks performed locally are presence checks, so the browser can
 * tell someone a field is empty before a round trip. Everything else is the
 * server's answer.
 */

export type Section = 'primary' | 'secondary';

export interface AdmissionFormValues {
  // Student
  surname: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  gender: string;
  religion: string;
  ethnicity: string;
  stateOfOrigin: string;
  previousSchool: string;
  lastClassAttended: string;
  // Guardian
  guardianName: string;
  homeAddress: string;
  phone: string;
  email: string;
  occupation: string;
  officeAddress: string;
  // Placement
  // The academic session is deliberately not here: it is set by the school
  // administrator on the server and is never shown to, or supplied by, a parent.
  section: Section | '';
  classApplyingFor: string;
  // Signature and optional detail
  typedName: string;
  healthInformation: string;
}

export const EMPTY_FORM: AdmissionFormValues = {
  surname: '',
  firstName: '',
  middleName: '',
  dateOfBirth: '',
  gender: '',
  religion: '',
  ethnicity: '',
  stateOfOrigin: '',
  previousSchool: '',
  lastClassAttended: '',
  guardianName: '',
  homeAddress: '',
  phone: '',
  email: '',
  occupation: '',
  officeAddress: '',
  section: '',
  classApplyingFor: '',
  typedName: '',
  healthInformation: '',
};

/** Fields the browser must not let through empty. Mirrors the server's required set. */
export const REQUIRED_FIELDS: Array<keyof AdmissionFormValues> = [
  'surname',
  'firstName',
  'dateOfBirth',
  'gender',
  'guardianName',
  'homeAddress',
  'phone',
  'section',
  'classApplyingFor',
  'typedName',
];

/** Maps a flat form field to the dotted path the API uses in `fields`. */
export const FIELD_PATHS: Record<string, string> = {
  surname: 'student.surname',
  firstName: 'student.firstName',
  middleName: 'student.middleName',
  dateOfBirth: 'student.dateOfBirth',
  gender: 'student.gender',
  religion: 'student.religion',
  ethnicity: 'student.ethnicity',
  stateOfOrigin: 'student.stateOfOrigin',
  previousSchool: 'student.previousSchool',
  lastClassAttended: 'student.lastClassAttended',
  guardianName: 'guardian.name',
  homeAddress: 'guardian.homeAddress',
  phone: 'guardian.phone',
  email: 'guardian.email',
  occupation: 'guardian.occupation',
  officeAddress: 'guardian.officeAddress',
  section: 'placement.section',
  classApplyingFor: 'placement.classApplyingFor',
  typedName: 'signature.typedName',
  healthInformation: 'healthInformation',
};

/** The dotted API path for a form field, for looking up a server error. */
export function pathFor(field: keyof AdmissionFormValues): string {
  return FIELD_PATHS[field] ?? String(field);
}

/** The reverse lookup, so the error summary can link a server path back to an input. */
const PATH_TO_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_PATHS).map(([field, path]) => [path, field]),
);

export function fieldForPath(path: string): string | undefined {
  return PATH_TO_FIELD[path];
}

/** Returns the class list for the chosen section; empty when none is chosen. */
export function classesForSection(
  section: Section | '',
  options: { primary: string[]; secondary: string[] } | null,
): string[] {
  if (!section || !options) return [];
  return section === 'primary' ? options.primary : options.secondary;
}

/**
 * Builds the request body. Server-owned fields (`submittedAt`, `signedAt`,
 * `search`, `revisions`, `deletedAt`) are simply not included — the client has
 * no business setting them, and the server would drop them anyway.
 */
export function toPayload(values: AdmissionFormValues): Record<string, unknown> {
  const blankToUndefined = (value: string): string | undefined =>
    value.trim() === '' ? undefined : value.trim();

  return {
    student: {
      surname: values.surname.trim(),
      firstName: values.firstName.trim(),
      middleName: blankToUndefined(values.middleName),
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      religion: blankToUndefined(values.religion),
      ethnicity: blankToUndefined(values.ethnicity),
      stateOfOrigin: blankToUndefined(values.stateOfOrigin),
      previousSchool: blankToUndefined(values.previousSchool),
      lastClassAttended: blankToUndefined(values.lastClassAttended),
    },
    guardian: {
      name: values.guardianName.trim(),
      homeAddress: values.homeAddress.trim(),
      phone: values.phone.trim(),
      email: blankToUndefined(values.email),
      occupation: blankToUndefined(values.occupation),
      officeAddress: blankToUndefined(values.officeAddress),
    },
    placement: {
      section: values.section,
      classApplyingFor: values.classApplyingFor,
    },
    signature: {
      typedName: values.typedName.trim(),
    },
    healthInformation: blankToUndefined(values.healthInformation),
  };
}

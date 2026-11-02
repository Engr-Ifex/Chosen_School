/**
 * Application schema validation — DB-07, DB-11 and the `gender` rule from
 * ADR-031.
 *
 * These run against `validateSync()`, with no database. That is deliberate: the
 * rules being tested are schema rules, and a test that needs a server to prove
 * `gender` is an enum would be skipped exactly when it matters.
 *
 * Persistence, unique indexes and query plans are covered separately in
 * models/db.integration.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { Application, deriveSearch } from './application.js';

/** A payload that must validate. Individual tests break one thing at a time. */
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    student: {
      surname: 'Adeyemi',
      firstName: 'Chidinma',
      middleName: 'Grace',
      dateOfBirth: new Date('2015-04-02'),
      gender: 'female',
    },
    guardian: {
      name: 'Adeyemi Olu',
      homeAddress: '1 Example Road',
      phone: '08031234567',
    },
    placement: {
      section: 'primary',
      classApplyingFor: 'PLACEHOLDER-Primary-1',
      academicSession: 'PLACEHOLDER-SESSION-A',
    },
    signature: {
      typedName: 'Adeyemi Olu',
      signedAt: new Date('2026-10-24T09:00:00.000Z'),
    },
    submittedAt: new Date('2026-10-24T09:00:00.000Z'),
    ...overrides,
  };
}

function errorsOf(payload: Record<string, unknown>) {
  return new Application(payload).validateSync()?.errors ?? {};
}

describe('Application schema', () => {
  it('accepts a well-formed application', () => {
    expect(errorsOf(validPayload())).toEqual({});
  });

  it('rejects a gender outside male | female (ADR-031)', () => {
    const errors = errorsOf(validPayload({ student: { ...(validPayload().student as object), gender: 'other' } }));
    expect(Object.keys(errors)).toContain('student.gender');
  });

  it('rejects each required field when it is missing', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['student.surname', { student: { ...(validPayload().student as object), surname: '' } }],
      ['student.firstName', { student: { ...(validPayload().student as object), firstName: '' } }],
      ['student.dateOfBirth', { student: { ...(validPayload().student as object), dateOfBirth: undefined } }],
      ['guardian.name', { guardian: { ...(validPayload().guardian as object), name: '' } }],
      ['guardian.phone', { guardian: { ...(validPayload().guardian as object), phone: '' } }],
      ['placement.section', { placement: { ...(validPayload().placement as object), section: 'tertiary' } }],
      ['signature.typedName', { signature: { ...(validPayload().signature as object), typedName: '' } }],
    ];

    for (const [path, override] of cases) {
      const errors = errorsOf(validPayload(override));
      expect(Object.keys(errors), `expected an error on ${path}`).toContain(path);
    }
  });

  it('rejects a date of birth in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const errors = errorsOf(validPayload({ student: { ...(validPayload().student as object), dateOfBirth: future } }));
    expect(Object.keys(errors)).toContain('student.dateOfBirth');
  });

  it('rejects a date of birth more than 100 years ago', () => {
    const ancient = new Date();
    ancient.setFullYear(ancient.getFullYear() - 101);
    const errors = errorsOf(validPayload({ student: { ...(validPayload().student as object), dateOfBirth: ancient } }));
    expect(Object.keys(errors)).toContain('student.dateOfBirth');
  });

  it('rejects health information longer than 1000 characters (DB-11)', () => {
    const errors = errorsOf(validPayload({ healthInformation: 'x'.repeat(1001) }));
    expect(Object.keys(errors)).toContain('healthInformation');
  });

  it('accepts health information of exactly 1000 characters', () => {
    expect(errorsOf(validPayload({ healthInformation: 'x'.repeat(1000) }))).toEqual({});
  });

  it('normalises a formatted phone number to digits', () => {
    const document = new Application(
      validPayload({ guardian: { ...(validPayload().guardian as object), phone: '+234 803 123 4567' } }),
    );
    expect(document.guardian.phone).toBe('2348031234567');
    expect(document.validateSync()?.errors ?? {}).toEqual({});
  });

  it('rejects a phone number with too few digits', () => {
    const errors = errorsOf(validPayload({ guardian: { ...(validPayload().guardian as object), phone: '12345' } }));
    expect(Object.keys(errors)).toContain('guardian.phone');
  });

  it('populates search.studentName and search.guardianPhone automatically (DB-07)', async () => {
    const document = new Application(validPayload());

    // `validate()` runs the pre-validate hook; `validateSync()` deliberately
    // does not run middleware, which is why this assertion uses the async form.
    await document.validate();

    expect(document.search.studentName).toBe('adeyemi chidinma grace');
    expect(document.search.guardianPhone).toBe('08031234567');
  });
});

describe('deriveSearch', () => {
  it('lowercases and joins the name parts, skipping blanks', () => {
    const result = deriveSearch(
      { surname: 'Adeyemi', firstName: 'Chidinma', gender: 'female' } as never,
      { phone: '0803 123 4567' } as never,
    );

    expect(result.studentName).toBe('adeyemi chidinma');
    expect(result.guardianPhone).toBe('08031234567');
  });
});

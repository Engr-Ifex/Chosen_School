import { describe, expect, it } from 'vitest';
import { admissionInputSchema, toFieldErrors } from './admission.js';

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    student: {
      surname: 'Adeyemi',
      firstName: 'Chidinma',
      dateOfBirth: '2015-04-02',
      gender: 'female',
    },
    guardian: {
      name: 'Adeyemi Olu',
      homeAddress: '1 Example Road',
      phone: '0803 123 4567',
    },
    placement: {
      section: 'primary',
      classApplyingFor: 'Primary 1',
      academicSession: '2026/2027',
    },
    signature: { typedName: 'Adeyemi Olu' },
    ...overrides,
  };
}

function fieldsOf(body: Record<string, unknown>): Record<string, string> {
  const parsed = admissionInputSchema.safeParse(body);
  if (parsed.success) throw new Error('expected validation to fail');
  return toFieldErrors(parsed.error);
}

describe('admissionInputSchema', () => {
  it('accepts a well-formed submission', () => {
    const parsed = admissionInputSchema.safeParse(payload());
    expect(parsed.success).toBe(true);
  });

  it('normalises a formatted phone number to digits', () => {
    const parsed = admissionInputSchema.safeParse(payload());
    if (!parsed.success) throw new Error('expected success');
    expect(parsed.data.guardian.phone).toBe('08031234567');
  });

  it('converts the date of birth to a Date', () => {
    const parsed = admissionInputSchema.safeParse(payload());
    if (!parsed.success) throw new Error('expected success');
    expect(parsed.data.student.dateOfBirth).toBeInstanceOf(Date);
  });

  it('reports the field path for each missing required field (API-P11)', () => {
    expect(Object.keys(fieldsOf(payload({ student: { firstName: 'x', dateOfBirth: '2015-04-02', gender: 'male' } })))).toContain(
      'student.surname',
    );
    expect(Object.keys(fieldsOf(payload({ guardian: { homeAddress: 'x', phone: '08031234567' } })))).toContain(
      'guardian.name',
    );
    expect(Object.keys(fieldsOf(payload({ signature: {} })))).toContain('signature.typedName');
  });

  it('rejects a gender outside male | female (ADR-031)', () => {
    const body = payload();
    body.student = { ...(body.student as object), gender: 'other' };
    expect(Object.keys(fieldsOf(body))).toContain('student.gender');
  });

  it('rejects a phone number with too few digits', () => {
    const body = payload();
    body.guardian = { ...(body.guardian as object), phone: '123' };
    expect(Object.keys(fieldsOf(body))).toContain('guardian.phone');
  });

  it('rejects an invalid email but accepts an absent one', () => {
    const bad = payload();
    bad.guardian = { ...(bad.guardian as object), email: 'not-an-email' };
    expect(Object.keys(fieldsOf(bad))).toContain('guardian.email');

    const absent = admissionInputSchema.safeParse(payload());
    expect(absent.success).toBe(true);
  });

  it('rejects health information longer than 1000 characters', () => {
    expect(Object.keys(fieldsOf(payload({ healthInformation: 'x'.repeat(1001) })))).toContain(
      'healthInformation',
    );
  });

  it('drops client-supplied server-owned fields instead of accepting them (API-P08)', () => {
    const parsed = admissionInputSchema.safeParse({
      ...payload(),
      submittedAt: '2001-01-01T00:00:00.000Z',
      deletedAt: '2001-01-01T00:00:00.000Z',
      search: { studentName: 'forged' },
      revisions: [{ at: '2001-01-01T00:00:00.000Z' }],
    });

    if (!parsed.success) throw new Error('expected success — these fields are stripped, not rejected');
    expect(parsed.data).not.toHaveProperty('submittedAt');
    expect(parsed.data).not.toHaveProperty('deletedAt');
    expect(parsed.data).not.toHaveProperty('search');
    expect(parsed.data).not.toHaveProperty('revisions');
  });

  it('drops a client-supplied signedAt', () => {
    const parsed = admissionInputSchema.safeParse({
      ...payload(),
      signature: { typedName: 'Adeyemi Olu', signedAt: '2001-01-01T00:00:00.000Z' },
    });

    if (!parsed.success) throw new Error('expected success');
    expect(parsed.data.signature).not.toHaveProperty('signedAt');
  });

  it('treats an empty optional string as not supplied', () => {
    const body = payload();
    body.student = { ...(body.student as object), middleName: '' };
    const parsed = admissionInputSchema.safeParse(body);

    if (!parsed.success) throw new Error('expected success');
    expect(parsed.data.student.middleName).toBeUndefined();
  });
});

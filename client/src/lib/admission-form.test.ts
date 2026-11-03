import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  REQUIRED_FIELDS,
  classesForSection,
  fieldForPath,
  pathFor,
  toPayload,
} from './admission-form';

const OPTIONS = { primary: ['Basic 1'], secondary: ['JSS1'] };

describe('classesForSection', () => {
  it('returns the primary list for primary', () => {
    expect(classesForSection('primary', OPTIONS)).toEqual(['Basic 1']);
  });

  it('returns the secondary list for secondary', () => {
    expect(classesForSection('secondary', OPTIONS)).toEqual(['JSS1']);
  });

  it('returns nothing until a section is chosen', () => {
    expect(classesForSection('', OPTIONS)).toEqual([]);
  });

  it('returns nothing when the options have not loaded', () => {
    expect(classesForSection('primary', null)).toEqual([]);
  });
});

describe('toPayload', () => {
  it('builds the nested API body', () => {
    const payload = toPayload({
      ...EMPTY_FORM,
      surname: 'Nwosu',
      firstName: 'Amara',
      dateOfBirth: '2016-03-11',
      gender: 'female',
      guardianName: 'Nwosu Peter',
      homeAddress: '12 Test Close',
      phone: '08035551234',
      section: 'primary',
      classApplyingFor: 'Basic 1',
      typedName: 'Nwosu Peter',
    }) as Record<string, Record<string, unknown>>;

    expect(payload.student).toMatchObject({ surname: 'Nwosu', firstName: 'Amara' });
    expect(payload.guardian).toMatchObject({ name: 'Nwosu Peter', phone: '08035551234' });
    expect(payload.placement).toMatchObject({ section: 'primary', classApplyingFor: 'Basic 1' });
    expect(payload.signature).toMatchObject({ typedName: 'Nwosu Peter' });
  });

  it('never sends server-owned fields', () => {
    const payload = toPayload(EMPTY_FORM) as Record<string, unknown>;

    for (const field of ['submittedAt', 'signedAt', 'search', 'revisions', 'deletedAt']) {
      expect(payload).not.toHaveProperty(field);
    }
    expect((payload.signature as Record<string, unknown>).signedAt).toBeUndefined();
  });

  it('omits empty optional fields rather than sending empty strings', () => {
    const payload = toPayload({ ...EMPTY_FORM, surname: 'Nwosu' }) as Record<string, unknown>;
    const student = payload.student as Record<string, unknown>;

    expect(student.middleName).toBeUndefined();
    expect(student.religion).toBeUndefined();
    expect(payload.healthInformation).toBeUndefined();
  });

  it('trims whitespace around values', () => {
    const payload = toPayload({ ...EMPTY_FORM, surname: '  Nwosu  ' }) as Record<string, unknown>;
    const student = payload.student as Record<string, unknown>;

    expect(student.surname).toBe('Nwosu');
  });
});

describe('field path mapping', () => {
  it('maps a form field to the API dotted path', () => {
    expect(pathFor('surname')).toBe('student.surname');
    expect(pathFor('guardianName')).toBe('guardian.name');
    expect(pathFor('classApplyingFor')).toBe('placement.classApplyingFor');
  });

  it('maps back, so the error summary can link to an input', () => {
    expect(fieldForPath('placement.classApplyingFor')).toBe('classApplyingFor');
    expect(fieldForPath('student.surname')).toBe('surname');
  });

  it('every required field has a server path', () => {
    for (const field of REQUIRED_FIELDS) {
      expect(pathFor(field)).toMatch(/\./);
    }
  });
});

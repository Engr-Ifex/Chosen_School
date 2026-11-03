import { describe, expect, it } from 'vitest';
import {
  CLASSES_BY_SECTION,
  DEFAULT_ACADEMIC_SESSION,
  PRIMARY_CLASSES,
  SECONDARY_CLASSES,
  isValidClassForSection,
  resolveAcademicSession,
} from './school.js';

/**
 * The approved class list is school policy expressed as data. These assertions
 * are deliberately exact: a renamed class or a changed order is a decision the
 * school made, not something a refactor should be able to alter quietly.
 */
describe('approved class list', () => {
  it('has the eight primary classes in the school order', () => {
    expect([...PRIMARY_CLASSES]).toEqual([
      'PG',
      'KG1',
      'KG2',
      'Basic 1',
      'Basic 2',
      'Basic 3',
      'Basic 4',
      'Basic 5',
    ]);
  });

  it('has the six secondary classes in the school order', () => {
    expect([...SECONDARY_CLASSES]).toEqual(['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']);
  });

  it('totals fourteen classes across both sections', () => {
    expect(PRIMARY_CLASSES.length + SECONDARY_CLASSES.length).toBe(14);
  });

  it('exposes the lists by section', () => {
    expect(CLASSES_BY_SECTION.primary).toEqual(PRIMARY_CLASSES);
    expect(CLASSES_BY_SECTION.secondary).toEqual(SECONDARY_CLASSES);
  });

  it('contains no duplicate class names across sections', () => {
    const all = [...PRIMARY_CLASSES, ...SECONDARY_CLASSES];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('isValidClassForSection', () => {
  it('accepts a primary class in the primary section', () => {
    expect(isValidClassForSection('primary', 'KG1')).toBe(true);
  });

  it('accepts a secondary class in the secondary section', () => {
    expect(isValidClassForSection('secondary', 'SS3')).toBe(true);
  });

  it('rejects a primary class in the secondary section', () => {
    expect(isValidClassForSection('secondary', 'Basic 1')).toBe(false);
  });

  it('rejects a secondary class in the primary section', () => {
    expect(isValidClassForSection('primary', 'JSS1')).toBe(false);
  });

  it('rejects an arbitrary class name', () => {
    expect(isValidClassForSection('primary', 'Year 99')).toBe(false);
  });

  it('is case and whitespace sensitive', () => {
    expect(isValidClassForSection('primary', 'basic 1')).toBe(false);
    expect(isValidClassForSection('primary', ' Basic 1')).toBe(false);
  });

  it('rejects an unknown section', () => {
    expect(isValidClassForSection('tertiary', 'Basic 1')).toBe(false);
  });
});

describe('resolveAcademicSession', () => {
  it('uses the administrator-configured session when present', () => {
    expect(resolveAcademicSession('2030/2031')).toBe('2030/2031');
  });

  it('falls back to the default when unset', () => {
    expect(resolveAcademicSession(null)).toBe(DEFAULT_ACADEMIC_SESSION);
    expect(resolveAcademicSession(undefined)).toBe(DEFAULT_ACADEMIC_SESSION);
    expect(resolveAcademicSession('   ')).toBe(DEFAULT_ACADEMIC_SESSION);
  });
});

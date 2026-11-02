/**
 * Settings schema — the singleton guarantee is enforced by a unique index, so
 * the schema-level half (DB-05) is tested here and the index half in
 * models/db.integration.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, Settings } from './settings.js';

function validSettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    school: {
      name: 'PLACEHOLDER — school name not yet supplied',
      address: 'PLACEHOLDER — school address not yet supplied',
      phone: '0000000000',
    },
    updatedAt: new Date('2026-10-24T09:00:00.000Z'),
    ...overrides,
  };
}

function errorsOf(payload: Record<string, unknown>) {
  return new Settings(payload).validateSync()?.errors ?? {};
}

describe('Settings schema', () => {
  it('defaults key to "site"', () => {
    const document = new Settings(validSettings());
    expect(document.key).toBe(SETTINGS_KEY);
    expect(document.validateSync()).toBeUndefined();
  });

  it('rejects a key other than "site"', () => {
    const errors = errorsOf(validSettings({ key: 'other' }));
    expect(Object.keys(errors)).toContain('key');
  });

  it('requires a school name', () => {
    const errors = errorsOf(
      validSettings({ school: { name: '', address: 'x', phone: '0000000000' } }),
    );
    expect(Object.keys(errors)).toContain('school.name');
  });

  it('rejects more than 10 social links', () => {
    const social = Array.from({ length: 11 }, (_, index) => ({
      platform: `p${index}`,
      url: 'https://example.test',
    }));
    const errors = errorsOf(validSettings({ social }));
    expect(Object.keys(errors)).toContain('social');
  });

  it('defaults the placement lists to empty arrays rather than undefined', () => {
    const document = new Settings(validSettings());
    expect(document.placement.primaryClasses).toEqual([]);
    expect(document.placement.secondaryClasses).toEqual([]);
    expect(document.placement.academicSessions).toEqual([]);
  });
});

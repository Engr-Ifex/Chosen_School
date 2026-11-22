/**
 * Storage configuration checks — S13. Each case is a mistake that would
 * otherwise surface only on the first upload, or never (the local driver on
 * Render silently losing photographs).
 *
 * Keys here are obvious placeholders. The legacy-JWT cases build an unsigned
 * token only to carry a `role` claim; nothing is verified or sent anywhere.
 */

import { describe, expect, it } from 'vitest';
import { loadStorageConfig } from './config.js';

const valid: NodeJS.ProcessEnv = {
  STORAGE_DRIVER: 'supabase',
  SUPABASE_URL: 'https://exampleref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_TEST_PLACEHOLDER_NOT_REAL',
  SUPABASE_BUCKET_PRIVATE: 'admissions-private',
  SUPABASE_BUCKET_PUBLIC: 'gallery-public',
};

/** An unsigned JWT-shaped string carrying only a `role` claim. */
function fakeJwt(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.placeholder-signature`;
}

const variables = (env: NodeJS.ProcessEnv, nodeEnv: 'development' | 'test' | 'production' = 'production') =>
  loadStorageConfig(env, nodeEnv).issues.map((issue) => issue.variable);

describe('loadStorageConfig', () => {
  it('defaults to the local driver outside production', () => {
    expect(loadStorageConfig({}, 'test').config).toEqual({ driver: 'local' });
    expect(loadStorageConfig({}, 'development').config).toEqual({ driver: 'local' });
  });

  it('defaults to Supabase in production, and requires its settings', () => {
    expect(variables({})).toEqual(
      expect.arrayContaining(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET_PRIVATE']),
    );
  });

  it('refuses the local driver in production — Render would lose every photo', () => {
    expect(variables({ STORAGE_DRIVER: 'local' })).toContain('STORAGE_DRIVER');
  });

  it('accepts a complete Supabase configuration', () => {
    const result = loadStorageConfig(valid, 'production');
    expect(result.issues).toEqual([]);
    expect(result.config).toMatchObject({ driver: 'supabase', privateBucket: 'admissions-private' });
  });

  it('rejects the /rest/v1 database address, and says how to fix it', () => {
    const result = loadStorageConfig({ ...valid, SUPABASE_URL: 'https://exampleref.supabase.co/rest/v1/' }, 'production');
    const issue = result.issues.find((entry) => entry.variable === 'SUPABASE_URL');
    expect(issue?.message).toMatch(/remove \/rest\/v1/);
  });

  it.each([
    'http://exampleref.supabase.co',
    'https://exampleref.supabase.co/',
    'https://example.com',
  ])('rejects the URL %s', (url) => {
    expect(variables({ ...valid, SUPABASE_URL: url })).toContain('SUPABASE_URL');
  });

  it('rejects the publishable key, naming the right one', () => {
    const result = loadStorageConfig(
      { ...valid, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_TEST_PLACEHOLDER' },
      'production',
    );
    const issue = result.issues.find((entry) => entry.variable === 'SUPABASE_SERVICE_ROLE_KEY');
    expect(issue?.message).toMatch(/publishable/);
    expect(issue?.message).toMatch(/sb_secret_/);
  });

  it('accepts a legacy service_role JWT but rejects a legacy anon JWT', () => {
    expect(variables({ ...valid, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role') })).toEqual([]);
    expect(variables({ ...valid, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('anon') })).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('never repeats the key in a message', () => {
    const key = 'sb_publishable_SHOULD_NOT_APPEAR_IN_MESSAGES';
    const result = loadStorageConfig({ ...valid, SUPABASE_SERVICE_ROLE_KEY: key }, 'production');
    expect(JSON.stringify(result.issues)).not.toContain(key);
  });

  it('refuses the same bucket for private and public', () => {
    expect(variables({ ...valid, SUPABASE_BUCKET_PUBLIC: 'admissions-private' })).toContain('SUPABASE_BUCKET_PUBLIC');
  });

  it('refuses Supabase in development unless explicitly allowed (ADR-035)', () => {
    expect(variables(valid, 'development')).toContain('STORAGE_DRIVER');
    expect(variables({ ...valid, ALLOW_REMOTE_DEV_STORAGE: 'true' }, 'development')).toEqual([]);
  });

  it('rejects an unknown driver', () => {
    expect(variables({ STORAGE_DRIVER: 's3' }, 'test')).toEqual(['STORAGE_DRIVER']);
  });
});

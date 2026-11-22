/**
 * Storage configuration — which driver, and with what (ADR-032, ADR-035,
 * ENVIRONMENT_VARIABLES.md §10).
 *
 * Selection is by environment, never by branching in business code (ROADMAP
 * S13): `STORAGE_DRIVER=local|supabase`. Callers only ever see `getStorage()`.
 *
 * The checks here are the ones that would otherwise fail quietly on the first
 * upload, in front of a parent:
 *  - **Production must use Supabase.** Render's disk is wiped on every deploy
 *    and restart, so the local driver there would lose every photograph.
 *  - **`SUPABASE_URL` must be the bare project URL.** The dashboard also shows
 *    a `/rest/v1` address, which is the database API; storage calls sent there
 *    fail with a confusing PostgREST error.
 *  - **The key must be a secret key.** The publishable key (`sb_publishable_…`)
 *    and the legacy `anon` key are designed to be public and cannot read a
 *    private bucket. Supabase's newer secret keys start `sb_secret_`; a legacy
 *    JWT must carry `role: service_role`.
 *  - **Development stays off the real project** unless explicitly allowed,
 *    the storage half of ADR-035.
 *
 * Messages name the variable and the fix, never the value.
 */

import type { ConfigIssue } from '../../config.js';

export type StorageConfig =
  | { driver: 'local' }
  | {
      driver: 'supabase';
      url: string;
      serviceKey: string;
      privateBucket: string;
      publicBucket: string;
    };

const PROJECT_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9_-]{1,62}$/;

/** The `role` claim of a legacy Supabase JWT key, without verifying it. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: unknown };
    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

/** Why a key is unusable for server-side storage, or `null` if it is fine. */
function keyProblem(key: string): string | null {
  if (key.startsWith('sb_secret_')) return null;
  if (key.startsWith('sb_publishable_')) {
    return 'this is the publishable key, which cannot read a private bucket; use a secret key (sb_secret_…) from Project Settings → API Keys';
  }
  if (key.startsWith('eyJ')) {
    const role = jwtRole(key);
    if (role === 'service_role') return null;
    return `this legacy key has role "${role ?? 'unknown'}", not service_role; use a secret key (sb_secret_…) from Project Settings → API Keys`;
  }
  return 'is not a recognisable Supabase secret key (expected sb_secret_…)';
}

export function loadStorageConfig(
  env: NodeJS.ProcessEnv,
  nodeEnv: 'development' | 'test' | 'production',
): { config: StorageConfig; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  const driver = env.STORAGE_DRIVER ?? (nodeEnv === 'production' ? 'supabase' : 'local');

  if (driver !== 'local' && driver !== 'supabase') {
    issues.push({ variable: 'STORAGE_DRIVER', message: 'must be local or supabase' });
    return { config: { driver: 'local' }, issues };
  }

  if (driver === 'local') {
    if (nodeEnv === 'production') {
      issues.push({
        variable: 'STORAGE_DRIVER',
        message: "must be supabase in production — Render's disk is wiped on every deploy (ADR-032)",
      });
    }
    return { config: { driver: 'local' }, issues };
  }

  if (nodeEnv === 'development' && env.ALLOW_REMOTE_DEV_STORAGE !== 'true') {
    issues.push({
      variable: 'STORAGE_DRIVER',
      message:
        'supabase is refused in development so local work never touches the real buckets; ' +
        'use local, or set ALLOW_REMOTE_DEV_STORAGE=true for a non-production project (ADR-035)',
    });
  }

  const url = env.SUPABASE_URL ?? '';
  if (!PROJECT_URL.test(url)) {
    issues.push({
      variable: 'SUPABASE_URL',
      message: url.includes('/rest/v1')
        ? 'is the database API address; remove /rest/v1 so it is just https://<project-ref>.supabase.co'
        : 'must be https://<project-ref>.supabase.co with no path or trailing slash',
    });
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (serviceKey === '') {
    issues.push({ variable: 'SUPABASE_SERVICE_ROLE_KEY', message: 'is required when STORAGE_DRIVER=supabase' });
  } else {
    const problem = keyProblem(serviceKey);
    if (problem) issues.push({ variable: 'SUPABASE_SERVICE_ROLE_KEY', message: problem });
  }

  const privateBucket = env.SUPABASE_BUCKET_PRIVATE ?? '';
  const publicBucket = env.SUPABASE_BUCKET_PUBLIC ?? '';
  for (const [variable, value] of [
    ['SUPABASE_BUCKET_PRIVATE', privateBucket],
    ['SUPABASE_BUCKET_PUBLIC', publicBucket],
  ] as const) {
    if (!BUCKET_NAME.test(value)) {
      issues.push({ variable, message: 'must be a bucket name (lowercase letters, digits, - or _)' });
    }
  }
  if (privateBucket !== '' && privateBucket === publicBucket) {
    issues.push({
      variable: 'SUPABASE_BUCKET_PUBLIC',
      message: 'must differ from SUPABASE_BUCKET_PRIVATE — a public bucket serves every object in it',
    });
  }

  return { config: { driver: 'supabase', url, serviceKey, privateBucket, publicBucket }, issues };
}

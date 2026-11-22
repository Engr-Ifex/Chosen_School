/**
 * Configuration loading and validation, per docs/ENVIRONMENT_VARIABLES.md §10.
 *
 * The rule this file exists to enforce: **fail at boot, naming the variable**.
 * A server that starts with a broken configuration fails later, in front of a
 * parent, with a stack trace instead of a message.
 *
 * Storage settings are validated in `lib/storage/config.ts` and folded in here,
 * so a wrong Supabase URL or key stops the server at boot rather than failing
 * on the first upload (S13).
 */

import { z } from 'zod';
import { loadStorageConfig, type StorageConfig } from './lib/storage/config.js';

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  mongoDbName: string;
  appOrigin: string;
  sessionCookieName: string;
  trustProxyHops: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /** Which storage driver, and its settings (S13). Never logged. */
  storage: StorageConfig;
}

export interface LoadConfigOptions {
  /**
   * Validate storage settings too. The database-only scripts (seed,
   * sync-indexes, provision-admin) pass `false`: they never touch storage, and
   * a storage mistake should not stop an administrator being provisioned.
   */
  storage?: boolean;
}

export interface ConfigIssue {
  variable: string;
  message: string;
}

export class ConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  ${i.variable}: ${i.message}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const absoluteUrl = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === '' &&
        !value.endsWith('/')
      );
    } catch {
      return false;
    }
  },
  { message: 'must be an absolute http(s) URL with no trailing slash' },
);

/**
 * The hostname from a `mongodb://` or `mongodb+srv://` URI.
 *
 * Credentials are stripped and only the first host of a replica set is used, so
 * the result is safe to log. Returns `null` if no host can be found.
 *
 * Used for the startup log that names the database actually in use, and by
 * the development guard in `loadConfig` (ADR-035).
 */
export function mongoHost(uri: string): string | null {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const authority = withoutScheme.split('/')[0] ?? '';
  const afterCredentials = authority.slice(authority.lastIndexOf('@') + 1);
  const host = afterCredentials.split(',')[0]?.split(':')[0]?.trim() ?? '';
  return host === '' ? null : host;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(10000),
  MONGODB_URI: z
    .string()
    .refine((v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), {
      message: 'must start with mongodb:// or mongodb+srv://',
    }),
  MONGODB_DB_NAME: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,38}$/, { message: 'must be lowercase letters, digits or underscore' })
    .default('chosen_school'),
  APP_ORIGIN: absoluteUrl,
  SESSION_COOKIE_NAME: z.string().min(1).default('__Host-cs_session'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  /** Opt-in to a non-local database in development (ADR-035). */
  ALLOW_REMOTE_DEV_DB: z.enum(['true', 'false']).default('false'),
});

/**
 * Hosts that count as "this machine" for the development database guard.
 * IPv6 literals are not recognised by `mongoHost`, so `[::1]` is refused — the
 * guard fails closed rather than guessing.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Parses and validates configuration from an environment-like object.
 * Throws ConfigError listing every problem, rather than only the first.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      variable: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw new ConfigError(issues);
  }

  const value = parsed.data;
  const issues: ConfigIssue[] = [];

  if (value.NODE_ENV === 'production') {
    if (!value.APP_ORIGIN.startsWith('https://')) {
      issues.push({ variable: 'APP_ORIGIN', message: 'must use https in production' });
    }
    if (!value.SESSION_COOKIE_NAME.startsWith('__Host-')) {
      issues.push({
        variable: 'SESSION_COOKIE_NAME',
        message: 'must start with __Host- in production (see ADR-016)',
      });
    }
  }

  // Development never reaches Atlas by accident (ADR-035). `.env.development`
  // points at the local database; this catches that override being deleted or
  // mistyped, which would otherwise fall back to the production URI in `.env`.
  if (value.NODE_ENV === 'development' && value.ALLOW_REMOTE_DEV_DB !== 'true') {
    const host = mongoHost(value.MONGODB_URI);
    if (!host || !LOCAL_HOSTS.has(host.toLowerCase())) {
      issues.push({
        variable: 'MONGODB_URI',
        message:
          'must point at a local database in development (run `npm run dev:db`); ' +
          'set ALLOW_REMOTE_DEV_DB=true only for a non-production cluster (ADR-035)',
      });
    }
  }

  const storage =
    options.storage === false
      ? { config: { driver: 'local' } as StorageConfig, issues: [] }
      : loadStorageConfig(env, value.NODE_ENV);
  issues.push(...storage.issues);

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    mongoUri: value.MONGODB_URI,
    mongoDbName: value.MONGODB_DB_NAME,
    appOrigin: value.APP_ORIGIN,
    sessionCookieName: value.SESSION_COOKIE_NAME,
    trustProxyHops: value.TRUST_PROXY_HOPS,
    logLevel: value.LOG_LEVEL,
    storage: storage.config,
  };
}

/**
 * Logs which variables are present, never their values, so a missing variable
 * is diagnosable without a secret appearing in a log aggregator.
 */
export function describePresence(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    result[name] = env[name] ? 'set' : 'missing';
  }
  return result;
}

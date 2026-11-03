/**
 * Configuration loading and validation, per docs/ENVIRONMENT_VARIABLES.md §10.
 *
 * The rule this file exists to enforce: **fail at boot, naming the variable**.
 * A server that starts with a broken configuration fails later, in front of a
 * parent, with a stack trace instead of a message.
 *
 * Scope note: S01 validates only what S01 uses. The Supabase variables become
 * required at S13, when storage is wired in — requiring them now would force
 * credentials before anything reads them.
 */

import { z } from 'zod';

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  mongoDbName: string;
  appOrigin: string;
  sessionCookieName: string;
  trustProxyHops: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
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
 * Used for the startup log that names the database actually in use — it makes
 * no decision about which database is allowed.
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
});

/**
 * Parses and validates configuration from an environment-like object.
 * Throws ConfigError listing every problem, rather than only the first.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
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

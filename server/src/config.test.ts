import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

/** A minimal environment that should be accepted. */
const valid: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  APP_ORIGIN: 'http://localhost:5173',
};

function captureIssues(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const config = loadConfig(valid);

    expect(config.port).toBe(3000);
    expect(config.mongoDbName).toBe('chosen_school');
    expect(config.sessionCookieName).toBe('__Host-cs_session');
    expect(config.trustProxyHops).toBe(0);
    expect(config.logLevel).toBe('info');
  });

  it('names the missing variable rather than failing generically', () => {
    const error = captureIssues({ ...valid, MONGODB_URI: undefined });

    expect(error.issues.map((issue) => issue.variable)).toContain('MONGODB_URI');
    expect(error.message).toContain('MONGODB_URI');
  });

  it('reports every problem at once, not just the first', () => {
    const error = captureIssues({ NODE_ENV: 'test' });
    const variables = error.issues.map((issue) => issue.variable);

    expect(variables).toEqual(expect.arrayContaining(['MONGODB_URI', 'APP_ORIGIN']));
  });

  it('rejects a MONGODB_URI with the wrong scheme', () => {
    const error = captureIssues({ ...valid, MONGODB_URI: 'postgres://localhost/db' });
    expect(error.issues.map((issue) => issue.variable)).toContain('MONGODB_URI');
  });

  it('rejects an APP_ORIGIN with a trailing slash', () => {
    const error = captureIssues({ ...valid, APP_ORIGIN: 'https://school.example/' });
    expect(error.issues.map((issue) => issue.variable)).toContain('APP_ORIGIN');
  });

  it('rejects a relative APP_ORIGIN', () => {
    const error = captureIssues({ ...valid, APP_ORIGIN: '/somewhere' });
    expect(error.issues.map((issue) => issue.variable)).toContain('APP_ORIGIN');
  });

  it('rejects a PORT outside the valid range', () => {
    const error = captureIssues({ ...valid, PORT: '70000' });
    expect(error.issues.map((issue) => issue.variable)).toContain('PORT');
  });

  it('rejects TRUST_PROXY_HOPS above the documented maximum', () => {
    const error = captureIssues({ ...valid, TRUST_PROXY_HOPS: '9' });
    expect(error.issues.map((issue) => issue.variable)).toContain('TRUST_PROXY_HOPS');
  });

  it('requires https for APP_ORIGIN in production', () => {
    const error = captureIssues({ ...valid, NODE_ENV: 'production' });
    expect(error.issues.map((issue) => issue.variable)).toContain('APP_ORIGIN');
  });

  it('requires a __Host- cookie name in production', () => {
    const error = captureIssues({
      ...valid,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://school.example',
      SESSION_COOKIE_NAME: 'cs_session',
    });
    expect(error.issues.map((issue) => issue.variable)).toContain('SESSION_COOKIE_NAME');
  });

  it('accepts a production configuration that satisfies the cookie rule', () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://school.example',
    });

    expect(config.nodeEnv).toBe('production');
    expect(config.sessionCookieName).toBe('__Host-cs_session');
  });
});

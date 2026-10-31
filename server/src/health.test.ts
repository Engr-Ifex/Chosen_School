/**
 * Health endpoint contract — API-P01, API-P02, SEC-09 in docs/TEST_PLAN.md.
 *
 * These tests pin the HTTP contract: which status, which body, and what must
 * never appear. They inject the database probe so they run everywhere and
 * assert the mapping rather than the database.
 *
 * The real probe against a real mongod is covered separately in
 * db.integration.test.ts, which is opt-in because it needs a mongod binary.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { disconnectDatabase } from './db.js';
import { createLogger } from './logger.js';

const logger = createLogger('error');

function appWithProbe(probe: () => Promise<boolean>) {
  return createApp({ logger, trustProxyHops: 0, isProduction: false, healthProbe: probe });
}

describe('GET /api/v1/health', () => {
  it('returns 200 and {status:"ok"} when the database answers', async () => {
    const response = await request(appWithProbe(async () => true)).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 503 and {status:"unavailable"} when it does not', async () => {
    const response = await request(appWithProbe(async () => false)).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });

  it('reports 503 rather than 500 when the probe throws', async () => {
    const response = await request(appWithProbe(async () => {
      throw new Error('connection reset');
    })).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toMatch(/connection reset/i);
  });

  it('returns 503 through the real probe when no database is connected', async () => {
    // Exercises the default code path (pingDatabase), not a stub. No database
    // is connected in this file, so the honest answer is "unavailable".
    await disconnectDatabase();

    const response = await request(createApp({ logger, trustProxyHops: 0, isProduction: false }))
      .get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });

  it('leaks no host, database name, or internal detail', async () => {
    const response = await request(appWithProbe(async () => true)).get('/api/v1/health');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toMatch(/mongodb/i);
    expect(serialised).not.toMatch(/127\.0\.0\.1|localhost/);
    expect(serialised).not.toMatch(/chosen_school/);
    expect(serialised).not.toMatch(/mongoose|version|uptime|memory/i);
  });
});

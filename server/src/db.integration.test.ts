/**
 * Health endpoint against a real MongoDB — the genuine API-P01.
 *
 * Opt-in, because it needs a `mongod` binary. `mongodb-memory-server` downloads
 * one on first use and caches it; where that download is unavailable the suite
 * must still run, so this file is skipped unless asked for:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * CI should set that flag. If it does not, this check silently stops running —
 * which is exactly the kind of quiet gap that makes a green build meaningless.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { createLogger } from './logger.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

describe.skipIf(!run)('health endpoint against a real database', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  it('returns 200 when a real mongod answers the ping', async () => {
    const response = await request(
      createApp({ logger, trustProxyHops: 0, isProduction: false }),
    ).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 503 once the database is stopped', async () => {
    await disconnectDatabase();

    const response = await request(
      createApp({ logger, trustProxyHops: 0, isProduction: false }),
    ).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });
});

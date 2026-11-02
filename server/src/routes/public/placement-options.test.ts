/**
 * `GET /api/v1/public/placement-options` — API_SPEC §2.3.
 *
 * Added as a prerequisite of S04: the form needs the school's class and session
 * lists, and hardcoding them would violate the PRD.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase } from '../../db.js';
import { createLogger } from '../../logger.js';
import { SETTINGS_KEY, Settings } from '../../models/settings.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

const app = () => createApp({ logger, trustProxyHops: 0, isProduction: false });

describe.skipIf(!run)('GET /api/v1/public/placement-options', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Settings.syncIndexes();
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Settings.deleteMany({});
  });

  it('returns the configured lists', async () => {
    await Settings.create({
      key: SETTINGS_KEY,
      school: { name: 'Placeholder', address: 'Placeholder', phone: '0000000000' },
      placement: {
        primaryClasses: ['Primary 1'],
        secondaryClasses: ['JSS 1'],
        academicSessions: ['2026/2027'],
        currentSession: '2026/2027',
      },
      updatedAt: new Date(),
    });

    const response = await request(app()).get('/api/v1/public/placement-options');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      primary: ['Primary 1'],
      secondary: ['JSS 1'],
      sessions: ['2026/2027'],
      currentSession: '2026/2027',
    });
  });

  it('returns no school contact details or internal identifiers', async () => {
    await Settings.create({
      key: SETTINGS_KEY,
      school: { name: 'Placeholder', address: '1 Secret Road', phone: '08099999999' },
      updatedAt: new Date(),
    });

    const response = await request(app()).get('/api/v1/public/placement-options');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('1 Secret Road');
    expect(serialised).not.toContain('08099999999');
    expect(response.body).not.toHaveProperty('_id');
  });

  it('returns 503 when settings have not been configured', async () => {
    const response = await request(app()).get('/api/v1/public/placement-options');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

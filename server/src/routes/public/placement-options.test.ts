/**
 * `GET /api/v1/public/placement-options` — API_SPEC §2.3.
 *
 * The regression this file exists for: the endpoint used to return **503 until a
 * `settings` document had been seeded**, which is why a parent saw "we could not
 * load the list of classes" and an empty dropdown on a fresh deployment. The
 * class list now comes from `config/school.ts` and does not touch the database.
 *
 * Opt-in, because the session lookup still touches MongoDB:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import {
  DEFAULT_ACADEMIC_SESSION,
  PRIMARY_CLASSES,
  SECONDARY_CLASSES,
} from '../../config/school.js';
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

  it('returns all fourteen approved classes in order', async () => {
    const response = await request(app()).get('/api/v1/public/placement-options');

    expect(response.status).toBe(200);
    expect(response.body.primary).toEqual([...PRIMARY_CLASSES]);
    expect(response.body.secondary).toEqual([...SECONDARY_CLASSES]);
    expect(response.body.primary).toHaveLength(8);
    expect(response.body.secondary).toHaveLength(6);
  });

  it('works with no settings document at all — the regression', async () => {
    // Nothing seeded. This previously returned 503 and broke the form.
    const response = await request(app()).get('/api/v1/public/placement-options');

    expect(response.status).toBe(200);
    expect(response.body.primary).toHaveLength(8);
    expect(response.body.currentSession).toBe(DEFAULT_ACADEMIC_SESSION);
  });

  it('reports the administrator-configured session when one is set', async () => {
    await Settings.create({
      key: SETTINGS_KEY,
      school: { name: 'Placeholder', address: 'Placeholder', phone: '0000000000' },
      placement: { currentSession: '2030/2031' },
      updatedAt: new Date(),
    });

    const response = await request(app()).get('/api/v1/public/placement-options');

    expect(response.body.currentSession).toBe('2030/2031');
    expect(response.body.primary).toHaveLength(8);
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
});

/**
 * PDF export endpoints — API-A26, API-A27, E2E-05, E2E-06.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * Content assertions live in `lib/pdf/application-pdf.test.ts`, where the
 * renderer is exercised directly. These tests are about the endpoint contract:
 * caps, unknown ids, headers and authorisation.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { createLogger } from '../logger.js';
import { Admin } from '../models/admin.js';
import { Application } from '../models/application.js';
import { Session } from '../models/session.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

const APP_ORIGIN = 'http://localhost:5173';
const COOKIE_NAME = 'cs_test_session';
const EMAIL = 'admin@example.test';
const PASSWORD = 'a-very-long-test-password';

function app() {
  return createApp({
    logger,
    trustProxyHops: 0,
    isProduction: false,
    appOrigin: APP_ORIGIN,
    sessionCookieName: COOKIE_NAME,
  });
}

async function seedApplication(surname: string, health: string | null = null) {
  return Application.create({
    student: { surname, firstName: 'Amara', dateOfBirth: new Date('2015-04-02'), gender: 'female' },
    guardian: { name: `${surname} Guardian`, homeAddress: '1 Example Road', phone: '08031234567' },
    placement: { section: 'primary', classApplyingFor: 'Basic 1', academicSession: '2026/2027' },
    signature: { typedName: `${surname} Guardian`, signedAt: new Date() },
    healthInformation: health,
    submittedAt: new Date('2026-10-01T09:00:00.000Z'),
  });
}

/** 51 syntactically valid identifiers that need not exist. */
const fiftyOneIds = Array.from({ length: 51 }, (_, index) =>
  `507f1f77bcf86cd79943${String(index).padStart(4, '0')}`,
).join(',');

describe.skipIf(!run)('pdf export', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([Admin.syncIndexes(), Application.syncIndexes(), Session.syncIndexes()]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([Admin.deleteMany({}), Application.deleteMany({}), Session.deleteMany({})]);

    const hashed = await hashPassword(PASSWORD);
    await Admin.create({
      email: EMAIL,
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      passwordParams: hashed.params,
      passwordUpdatedAt: new Date(),
    });
  });

  async function signedIn() {
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    return agent;
  }

  it('requires a session', async () => {
    const response = await request(app()).get(
      '/api/v1/admin/applications/507f1f77bcf86cd799439011/pdf',
    );

    expect(response.status).toBe(401);
  });

  it('returns a single application as a PDF (E2E-05)', async () => {
    const created = await seedApplication('Adeyemi', 'Asthma — carries an inhaler');
    const agent = await signedIn();

    const response = await agent.get(
      `/api/v1/admin/applications/${created._id.toString()}/pdf`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('Adeyemi');
    // Personal data must not be cached anywhere.
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns a bulk PDF for several records (E2E-06)', async () => {
    const a = await seedApplication('Adeyemi');
    const b = await seedApplication('Okonkwo');
    const c = await seedApplication('Balogun');
    const agent = await signedIn();

    const response = await agent.get(
      `/api/v1/admin/applications/pdf?ids=${a._id},${b._id},${c._id}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('applications-3.pdf');
  });

  it('rejects 51 ids without producing a partial PDF (API-A26)', async () => {
    const agent = await signedIn();
    const response = await agent.get(`/api/v1/admin/applications/pdf?ids=${fiftyOneIds}`);

    expect(response.status).toBe(422);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.error.fields).toHaveProperty('ids');
  });

  it('accepts exactly 50 ids', async () => {
    const ids = fiftyOneIds.split(',').slice(0, 50);

    // All 50 exist, so the cap is what is under test, not the existence check.
    const created = await Promise.all(ids.map((_, index) => seedApplication(`Bulk${index}`)));

    const agent = await signedIn();
    const response = await agent.get(
      `/api/v1/admin/applications/pdf?ids=${created.map((doc) => doc._id).join(',')}`,
    );

    expect(response.status).toBe(200);
  });

  it('returns 404 when one id does not exist (API-A27)', async () => {
    const created = await seedApplication('Adeyemi');
    const agent = await signedIn();

    const response = await agent.get(
      `/api/v1/admin/applications/pdf?ids=${created._id},507f1f77bcf86cd799439011`,
    );

    expect(response.status).toBe(404);
    // No PDF body at all — not a file containing only the records that existed.
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('rejects a malformed id in the list', async () => {
    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications/pdf?ids=not-an-id');

    expect(response.status).toBe(422);
  });

  it('rejects an empty selection', async () => {
    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications/pdf?ids=');

    expect(response.status).toBe(422);
  });

  it('returns 404 for a single record that does not exist', async () => {
    const agent = await signedIn();
    const response = await agent.get(
      '/api/v1/admin/applications/507f1f77bcf86cd799439011/pdf',
    );

    expect(response.status).toBe(404);
  });

  it('exports a record that has no photograph (S-05)', async () => {
    const created = await seedApplication('NoPhoto');
    const agent = await signedIn();

    const response = await agent.get(
      `/api/v1/admin/applications/${created._id.toString()}/pdf`,
    );

    expect(response.status).toBe(200);
    expect(Buffer.from(response.body).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

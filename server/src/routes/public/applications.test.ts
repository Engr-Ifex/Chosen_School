/**
 * `POST /api/v1/public/applications` — API-P07 to P11, P14, P15.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * These run against a real `mongod` rather than a stubbed service, because the
 * acceptance criteria are about what ends up **persisted** — "valid → 201" means
 * little if the document was never written.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase } from '../../db.js';
import { createLogger } from '../../logger.js';
import { Application } from '../../models/application.js';
import { SETTINGS_KEY, Settings } from '../../models/settings.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

const app = () => createApp({ logger, trustProxyHops: 0, isProduction: false });

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    student: {
      surname: 'TEST-Applicant',
      firstName: 'Chidinma',
      dateOfBirth: '2015-04-02',
      gender: 'female',
    },
    guardian: {
      name: 'TEST-Guardian',
      homeAddress: '1 Example Road',
      phone: '08031234567',
    },
    placement: {
      section: 'primary',
      classApplyingFor: 'Primary 1',
      academicSession: '2026/2027',
    },
    signature: { typedName: 'TEST-Guardian' },
    ...overrides,
  };
}

async function seedSettings(): Promise<void> {
  await Settings.create({
    key: SETTINGS_KEY,
    school: { name: 'Placeholder', address: 'Placeholder', phone: '0000000000' },
    placement: {
      primaryClasses: ['Primary 1', 'Primary 2'],
      secondaryClasses: ['JSS 1'],
      academicSessions: ['2026/2027'],
      currentSession: '2026/2027',
    },
    updatedAt: new Date(),
  });
}

describe.skipIf(!run)('POST /api/v1/public/applications', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([Application.syncIndexes(), Settings.syncIndexes()]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([Application.deleteMany({}), Settings.deleteMany({})]);
    await seedSettings();
  });

  it('accepts a valid submission and persists it (API-P07)', async () => {
    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(201);
    expect(response.body.id).toEqual(expect.any(String));

    const stored = await Application.findById(response.body.id);
    expect(stored).not.toBeNull();
    expect(stored?.student.surname).toBe('TEST-Applicant');
    // Server-set, and close to now — not the client's value.
    expect(stored?.signature.signedAt).toBeInstanceOf(Date);
    expect(stored?.submittedAt).toBeInstanceOf(Date);
    // Derived by the model hook, never sent by the client.
    expect(stored?.search.studentName).toBe('test-applicant chidinma');
  });

  it('ignores client-supplied submittedAt and deletedAt (API-P08)', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .send({
        ...payload(),
        submittedAt: '2001-01-01T00:00:00.000Z',
        deletedAt: '2001-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(201);

    const stored = await Application.findById(response.body.id);
    expect(stored?.submittedAt.getUTCFullYear()).not.toBe(2001);
    expect(stored?.deletedAt).toBeNull();
  });

  it('rejects a class from the other section, naming the field (API-P09)', async () => {
    const body = payload();
    body.placement = {
      section: 'secondary',
      classApplyingFor: 'Primary 1', // a primary class, in the secondary section
      academicSession: '2026/2027',
    };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields).toHaveProperty('placement.classApplyingFor');
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('rejects an unknown academic session (API-P10)', async () => {
    const body = payload();
    body.placement = { section: 'primary', classApplyingFor: 'Primary 1', academicSession: '1999/2000' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('placement.academicSession');
  });

  it('rejects a missing required field with its path (API-P11)', async () => {
    const body = payload();
    body.student = { firstName: 'Chidinma', dateOfBirth: '2015-04-02', gender: 'female' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('student.surname');
  });

  it('echoes no personal data in the response (API-P14)', async () => {
    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(['id', 'submittedAt']);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('TEST-Applicant');
    expect(serialised).not.toContain('08031234567');
    expect(serialised).not.toContain('Example Road');
  });

  it('stores two identical submissions separately (API-P15)', async () => {
    const first = await request(app()).post('/api/v1/public/applications').send(payload());
    const second = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(await Application.countDocuments({})).toBe(2);
  });

  it('returns 503 when settings have not been configured', async () => {
    await Settings.deleteMany({});

    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

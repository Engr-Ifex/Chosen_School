/**
 * `POST /api/v1/public/applications` — API-P07 to P11, P14, P15, plus the
 * S04 correction: the academic session is administrator-controlled.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { DEFAULT_ACADEMIC_SESSION } from '../../config/school.js';
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
      classApplyingFor: 'Basic 1',
    },
    signature: { typedName: 'TEST-Guardian' },
    ...overrides,
  };
}

async function seedSettings(currentSession: string | null = '2030/2031'): Promise<void> {
  await Settings.create({
    key: SETTINGS_KEY,
    school: { name: 'Placeholder', address: 'Placeholder', phone: '0000000000' },
    placement: { currentSession },
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
  });

  it('accepts a valid submission and persists it (API-P07)', async () => {
    await seedSettings();
    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(201);
    expect(response.body.id).toEqual(expect.any(String));

    const stored = await Application.findById(response.body.id);
    expect(stored).not.toBeNull();
    expect(stored?.student.surname).toBe('TEST-Applicant');
    expect(stored?.placement.classApplyingFor).toBe('Basic 1');
    expect(stored?.signature.signedAt).toBeInstanceOf(Date);
    expect(stored?.search.studentName).toBe('test-applicant chidinma');
  });

  it('accepts a secondary class in the secondary section', async () => {
    await seedSettings();
    const body = payload();
    body.placement = { section: 'secondary', classApplyingFor: 'SS2' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(201);
    const stored = await Application.findById(response.body.id);
    expect(stored?.placement.section).toBe('secondary');
    expect(stored?.placement.classApplyingFor).toBe('SS2');
  });

  it('ignores client-supplied submittedAt and deletedAt (API-P08)', async () => {
    await seedSettings();
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
    await seedSettings();
    const body = payload();
    body.placement = { section: 'secondary', classApplyingFor: 'Basic 1' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('placement.classApplyingFor');
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('rejects an arbitrary class name', async () => {
    await seedSettings();
    const body = payload();
    body.placement = { section: 'primary', classApplyingFor: 'Year 99' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('placement.classApplyingFor');
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('rejects a missing required field with its path (API-P11)', async () => {
    await seedSettings();
    const body = payload();
    body.student = { firstName: 'Chidinma', dateOfBirth: '2015-04-02', gender: 'female' };

    const response = await request(app()).post('/api/v1/public/applications').send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('student.surname');
  });

  it('echoes no personal data in the response (API-P14)', async () => {
    await seedSettings();
    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(['id', 'submittedAt']);
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('TEST-Applicant');
    expect(serialised).not.toContain('08031234567');
  });

  it('stores two identical submissions separately (API-P15)', async () => {
    await seedSettings();
    const first = await request(app()).post('/api/v1/public/applications').send(payload());
    const second = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(await Application.countDocuments({})).toBe(2);
  });

  describe('academic session is administrator-controlled', () => {
    it('files the application under the configured session', async () => {
      await seedSettings('2030/2031');

      const response = await request(app()).post('/api/v1/public/applications').send(payload());

      const stored = await Application.findById(response.body.id);
      expect(stored?.placement.academicSession).toBe('2030/2031');
    });

    it('ignores a session supplied by the parent', async () => {
      await seedSettings('2030/2031');
      const body = payload();
      body.placement = {
        section: 'primary',
        classApplyingFor: 'Basic 1',
        academicSession: '1999/2000',
      };

      const response = await request(app()).post('/api/v1/public/applications').send(body);

      expect(response.status).toBe(201);
      const stored = await Application.findById(response.body.id);
      expect(stored?.placement.academicSession).toBe('2030/2031');
      expect(stored?.placement.academicSession).not.toBe('1999/2000');
    });

    it('falls back to the configured default when settings do not exist', async () => {
      // No settings document at all. The application must still be accepted —
      // a parent cannot fix a missing administrator configuration.
      const response = await request(app()).post('/api/v1/public/applications').send(payload());

      expect(response.status).toBe(201);
      const stored = await Application.findById(response.body.id);
      expect(stored?.placement.academicSession).toBe(DEFAULT_ACADEMIC_SESSION);
    });
  });
});

/**
 * Admin applications list and detail — API-A06 to A10, S-01 to S-04.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { connectDatabase, disconnectDatabase } from '../../db.js';
import { hashPassword } from '../../lib/password.js';
import { createLogger } from '../../logger.js';
import { Admin } from '../../models/admin.js';
import { Application } from '../../models/application.js';
import { Session } from '../../models/session.js';

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

interface SeedOptions {
  surname: string;
  firstName?: string;
  phone: string;
  section?: 'primary' | 'secondary';
  className?: string;
  session?: string;
  healthInformation?: string | null;
  submittedAt?: Date;
  deletedAt?: Date | null;
}

async function seedApplication(options: SeedOptions) {
  return Application.create({
    student: {
      surname: options.surname,
      firstName: options.firstName ?? 'Chidinma',
      dateOfBirth: new Date('2015-04-02'),
      gender: 'female',
    },
    guardian: {
      name: `${options.surname} Guardian`,
      homeAddress: '1 Example Road',
      phone: options.phone,
    },
    placement: {
      section: options.section ?? 'primary',
      classApplyingFor: options.className ?? 'Basic 1',
      academicSession: options.session ?? '2026/2027',
    },
    signature: { typedName: `${options.surname} Guardian`, signedAt: new Date() },
    healthInformation: options.healthInformation ?? null,
    submittedAt: options.submittedAt ?? new Date(),
    deletedAt: options.deletedAt ?? null,
  });
}

describe.skipIf(!run)('admin applications', () => {
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

  /** A signed-in agent, so the session cookie is carried automatically. */
  async function signedIn() {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    return agent;
  }

  it('rejects an unauthenticated request', async () => {
    const response = await request(app()).get('/api/v1/admin/applications');

    expect(response.status).toBe(401);
  });

  it('never includes healthInformation in a list item (API-A06)', async () => {
    await seedApplication({
      surname: 'Adeyemi',
      phone: '08031234567',
      healthInformation: 'Severe nut allergy — this must not appear in a list',
    });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('nut allergy');
    expect(response.body.data[0]).not.toHaveProperty('healthInformation');
    expect(response.body.data[0]).not.toHaveProperty('revisions');
    expect(response.body.data[0]).not.toHaveProperty('search');
  });

  it('returns only the fixed projection fields', async () => {
    await seedApplication({ surname: 'Adeyemi', phone: '08031234567' });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications');
    const item = response.body.data[0];

    expect(Object.keys(item).sort()).toEqual(
      ['guardian', 'hasPhoto', 'id', 'placement', 'student', 'submittedAt'].sort(),
    );
    expect(item.hasPhoto).toBe(false);
  });

  it('finds a record by name prefix (API-A07)', async () => {
    await seedApplication({ surname: 'Adeyemi', phone: '08031234567' });
    await seedApplication({ surname: 'Okonkwo', phone: '08037654321' });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?q=ade');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].student.surname).toBe('Adeyemi');
  });

  it('finds a record by exact phone digits (API-A08)', async () => {
    await seedApplication({ surname: 'Adeyemi', phone: '08031234567' });
    await seedApplication({ surname: 'Okonkwo', phone: '08037654321' });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?q=08037654321');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].student.surname).toBe('Okonkwo');
  });

  it('accepts a phone number typed with spaces', async () => {
    await seedApplication({ surname: 'Adeyemi', phone: '08031234567' });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?q=0803 123 4567');

    expect(response.body.data).toHaveLength(1);
  });

  it('rejects a sort value that is not whitelisted (API-A09)', async () => {
    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?sort=__v');

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('sort');
  });

  it('rejects a page size above 100 (API-A10)', async () => {
    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?pageSize=500');

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('pageSize');
  });

  it('filters by section, class and session together (S-01)', async () => {
    await seedApplication({ surname: 'Alpha', phone: '08030000001', section: 'primary', className: 'Basic 1', session: '2026/2027' });
    await seedApplication({ surname: 'Bravo', phone: '08030000002', section: 'primary', className: 'Basic 2', session: '2026/2027' });
    await seedApplication({ surname: 'Charlie', phone: '08030000003', section: 'secondary', className: 'JSS1', session: '2026/2027' });
    await seedApplication({ surname: 'Delta', phone: '08030000004', section: 'primary', className: 'Basic 1', session: '2025/2026' });

    const agent = await signedIn();
    const response = await agent.get(
      '/api/v1/admin/applications?section=primary&class=Basic%201&session=2026/2027',
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].student.surname).toBe('Alpha');
    expect(response.body.meta.total).toBe(1);
  });

  it('returns 200 with an empty list when nothing matches (S-02)', async () => {
    await seedApplication({ surname: 'Adeyemi', phone: '08031234567' });

    const agent = await signedIn();
    const response = await agent.get('/api/v1/admin/applications?q=zzzzz');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it('sorts by surname in both directions (S-03)', async () => {
    for (const [surname, phone] of [
      ['Charlie', '08030000003'],
      ['Alpha', '08030000001'],
      ['Bravo', '08030000002'],
    ] as const) {
      await seedApplication({ surname, phone });
    }

    const agent = await signedIn();
    const ascending = await agent.get('/api/v1/admin/applications?sort=student.surname');
    const descending = await agent.get('/api/v1/admin/applications?sort=-student.surname');

    expect(ascending.body.data.map((i: { student: { surname: string } }) => i.student.surname)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    expect(descending.body.data.map((i: { student: { surname: string } }) => i.student.surname)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
  });

  it('paginates without duplicates or omissions (S-04)', async () => {
    for (let index = 0; index < 7; index += 1) {
      await seedApplication({
        surname: `Applicant${index}`,
        phone: `0803000${String(index).padStart(4, '0')}`,
        // Identical timestamps, so only the `_id` tiebreaker keeps pages stable.
        submittedAt: new Date('2026-10-01T09:00:00.000Z'),
      });
    }

    const agent = await signedIn();
    const first = await agent.get('/api/v1/admin/applications?pageSize=3&page=1');
    const second = await agent.get('/api/v1/admin/applications?pageSize=3&page=2');
    const third = await agent.get('/api/v1/admin/applications?pageSize=3&page=3');

    expect(first.body.meta).toMatchObject({ page: 1, pageSize: 3, total: 7, totalPages: 3 });

    const ids = [...first.body.data, ...second.body.data, ...third.body.data].map(
      (i: { id: string }) => i.id,
    );
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
  });

  it('excludes trashed records unless asked for them', async () => {
    await seedApplication({ surname: 'Active', phone: '08030000001' });
    await seedApplication({ surname: 'Trashed', phone: '08030000002', deletedAt: new Date() });

    const agent = await signedIn();
    const normal = await agent.get('/api/v1/admin/applications');
    const withTrashed = await agent.get('/api/v1/admin/applications?includeTrashed=true');

    expect(normal.body.data).toHaveLength(1);
    expect(normal.body.data[0].student.surname).toBe('Active');
    expect(withTrashed.body.data).toHaveLength(2);
  });

  describe('detail', () => {
    it('returns the full record including health information', async () => {
      const created = await seedApplication({
        surname: 'Adeyemi',
        phone: '08031234567',
        healthInformation: 'Asthma — carries an inhaler',
      });

      const agent = await signedIn();
      const response = await agent.get(`/api/v1/admin/applications/${created._id.toString()}`);

      expect(response.status).toBe(200);
      expect(response.body.student.surname).toBe('Adeyemi');
      expect(response.body.healthInformation).toBe('Asthma — carries an inhaler');
      expect(response.body.placement.classApplyingFor).toBe('Basic 1');
    });

    it('returns 404 for a well-formed id that does not exist', async () => {
      const agent = await signedIn();
      const response = await agent.get('/api/v1/admin/applications/507f1f77bcf86cd799439011');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects a malformed id as a validation error', async () => {
      const agent = await signedIn();
      const response = await agent.get('/api/v1/admin/applications/not-an-id');

      expect(response.status).toBe(422);
    });

    it('requires a session', async () => {
      const response = await request(app()).get(
        '/api/v1/admin/applications/507f1f77bcf86cd799439011',
      );

      expect(response.status).toBe(401);
    });
  });
});

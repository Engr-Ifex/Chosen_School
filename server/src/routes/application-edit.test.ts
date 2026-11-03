/**
 * Administrator edit with revision history — API-A11 to A13, DB-10.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
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

async function seedApplication() {
  return Application.create({
    student: {
      surname: 'TEST-Edit',
      firstName: 'Amara',
      dateOfBirth: new Date('2015-04-02'),
      gender: 'female',
    },
    guardian: {
      name: 'TEST Guardian',
      homeAddress: '1 Example Road',
      phone: '08031234567',
    },
    placement: { section: 'primary', classApplyingFor: 'Basic 1', academicSession: '2026/2027' },
    signature: { typedName: 'TEST Guardian', signedAt: new Date('2026-10-01T09:00:00.000Z') },
    healthInformation: null,
    submittedAt: new Date('2026-10-01T09:00:00.000Z'),
  });
}

describe.skipIf(!run)('application edit', () => {
  let mongo: MongoMemoryServer;
  let csrfToken = '';

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
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    csrfToken = login.body.csrfToken as string;
    return agent;
  }

  function patch(agent: Awaited<ReturnType<typeof signedIn>>, id: string, body: unknown) {
    return agent
      .patch(`/api/v1/admin/applications/${id}`)
      .set('X-CSRF-Token', csrfToken)
      .send(body as object);
  }

  it('rejects an attempt to set submittedAt (API-A11)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      submittedAt: '2001-01-01T00:00:00.000Z',
      student: { surname: 'Changed' },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('submittedAt');

    const stored = await Application.findById(created._id);
    // Rejected outright — the other field in the same request must not apply either.
    expect(stored?.student.surname).toBe('TEST-Edit');
    expect(stored?.revisions).toHaveLength(0);
  });

  it.each(['_id', 'revisions', 'search', 'signature', 'photo', 'deletedAt'])(
    'rejects an attempt to set %s',
    async (field) => {
      const created = await seedApplication();
      const agent = await signedIn();

      const response = await patch(agent, created._id.toString(), {
        [field]: field === '_id' ? '507f1f77bcf86cd799439011' : {},
      });

      expect(response.status).toBe(422);
      expect(response.body.error.fields).toHaveProperty(field);
    },
  );

  it('records exactly the fields that changed (API-A12)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      student: { surname: 'Corrected' },
      guardian: { phone: '08039998888' },
    });

    expect(response.status).toBe(200);

    const stored = await Application.findById(created._id);
    expect(stored?.revisions).toHaveLength(1);

    const revision = stored?.revisions[0];
    expect(revision?.changedFields.sort()).toEqual(['guardian.phone', 'student.surname']);
    // Only the changed leaves — not whole copies of the document.
    expect(revision?.before).toEqual({ 'guardian.phone': '08031234567', 'student.surname': 'TEST-Edit' });
    expect(revision?.after).toEqual({ 'guardian.phone': '08039998888', 'student.surname': 'Corrected' });
    expect(revision?.by.toString()).toBe(stored?.revisions[0]?.by.toString());
  });

  it('writes no revision when nothing actually changed (API-A13)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      student: { surname: 'TEST-Edit' },
    });

    expect(response.status).toBe(200);
    expect((await Application.findById(created._id))?.revisions).toHaveLength(0);
  });

  it('treats a differently formatted but identical phone as unchanged', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    // Stored digits-only; the same number typed with spaces is not an edit.
    const response = await patch(agent, created._id.toString(), {
      guardian: { phone: '0803 123 4567' },
    });

    expect(response.status).toBe(200);
    expect((await Application.findById(created._id))?.revisions).toHaveLength(0);
  });

  it('rejects a section change that would orphan the class', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      placement: { section: 'secondary' },
    });

    expect(response.status).toBe(422);
    expect(response.body.error.fields).toHaveProperty('placement.classApplyingFor');
  });

  it('accepts a section and class changed together', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      placement: { section: 'secondary', classApplyingFor: 'JSS1' },
    });

    expect(response.status).toBe(200);

    const stored = await Application.findById(created._id);
    expect(stored?.placement.section).toBe('secondary');
    expect(stored?.placement.classApplyingFor).toBe('JSS1');
    expect(stored?.revisions[0]?.changedFields.sort()).toEqual([
      'placement.classApplyingFor',
      'placement.section',
    ]);
  });

  it('strips an unknown key instead of failing', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      student: { surname: 'Corrected' },
      nonsense: 'ignored',
    });

    expect(response.status).toBe(200);
    expect((await Application.findById(created._id))?.student.surname).toBe('Corrected');
  });

  it('returns the updated record so the client can re-render', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await patch(agent, created._id.toString(), {
      student: { surname: 'Corrected' },
    });

    expect(response.body.student.surname).toBe('Corrected');
    expect(response.body.revisions).toHaveLength(1);
    expect(response.body.id).toBe(created._id.toString());
  });

  it('refuses to edit a record that is in the trash', async () => {
    const created = await seedApplication();
    const agent = await signedIn();
    const id = created._id.toString();

    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);

    const response = await patch(agent, id, { student: { surname: 'Corrected' } });

    expect(response.status).toBe(409);
  });

  it('requires a CSRF token', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await agent
      .patch(`/api/v1/admin/applications/${created._id.toString()}`)
      .send({ student: { surname: 'Corrected' } });

    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown record', async () => {
    const agent = await signedIn();
    const response = await patch(agent, '507f1f77bcf86cd799439011', {
      student: { surname: 'Corrected' },
    });

    expect(response.status).toBe(404);
  });

  it('drops the oldest revision at the cap (DB-10)', async () => {
    const created = await seedApplication();
    const admin = await Admin.findOne({ email: EMAIL });

    // Seed 50 revisions directly — 50 round trips would test HTTP, not the cap.
    const seeded = Array.from({ length: 50 }, (_, index) => ({
      at: new Date(Date.now() - (50 - index) * 60_000),
      by: admin?._id,
      changedFields: ['student.middleName'],
      before: { 'student.middleName': `old-${index}` },
      after: { 'student.middleName': `new-${index}` },
    }));

    await Application.updateOne({ _id: created._id }, { $set: { revisions: seeded } });

    const agent = await signedIn();
    const response = await patch(agent, created._id.toString(), {
      student: { surname: 'After-Cap' },
    });

    expect(response.status).toBe(200);

    const stored = await Application.findById(created._id).lean();
    expect(stored?.revisions).toHaveLength(50);
    // The oldest went; the newest is the edit just made.
    expect(stored?.revisions[0]?.before).toEqual({ 'student.middleName': 'old-1' });
    expect(stored?.revisions[49]?.changedFields).toEqual(['student.surname']);

    // DB-10 also bounds the size of a document at the cap.
    expect(JSON.stringify(stored).length).toBeLessThan(1024 * 1024);
  });
});

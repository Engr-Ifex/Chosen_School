/**
 * Trash, restore and permanent delete — API-A14 to A18, F-14.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * Storage is mocked so the failure path (A18) can be exercised. The real driver
 * is covered by `lib/storage/local.test.ts`, and the object actually leaving the
 * disk is checked in the slice's recorded run.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../lib/storage/index.js', () => ({ getStorage: () => storage }));

const { createApp } = await import('../app.js');
const { connectDatabase, disconnectDatabase } = await import('../db.js');
const { hashPassword } = await import('../lib/password.js');
const { createLogger } = await import('../logger.js');
const { Admin } = await import('../models/admin.js');
const { Application } = await import('../models/application.js');
const { AuditLog } = await import('../models/auditlog.js');
const { Session } = await import('../models/session.js');

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

async function seedApplication(options: { withPhoto?: boolean } = {}) {
  return Application.create({
    student: {
      surname: 'TEST-Trash',
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
    signature: { typedName: 'TEST Guardian', signedAt: new Date() },
    healthInformation: 'TEST-health-marker',
    photo: options.withPhoto
      ? {
          key: 'applications/test-photo.webp',
          contentType: 'image/webp',
          width: 10,
          height: 10,
          bytes: 100,
          uploadedAt: new Date(),
        }
      : null,
    submittedAt: new Date('2026-10-01T09:00:00.000Z'),
  });
}

describe.skipIf(!run)('trash lifecycle', () => {
  let mongo: MongoMemoryServer;
  let csrfToken = '';

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([
      Admin.syncIndexes(),
      Application.syncIndexes(),
      Session.syncIndexes(),
      AuditLog.syncIndexes(),
    ]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Admin.deleteMany({}),
      Application.deleteMany({}),
      Session.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    storage.put.mockReset().mockResolvedValue(undefined);
    storage.get.mockReset().mockResolvedValue(null);
    storage.remove.mockReset().mockResolvedValue(undefined);

    const hashed = await hashPassword(PASSWORD);
    await Admin.create({
      email: EMAIL,
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      passwordParams: hashed.params,
      passwordUpdatedAt: new Date(),
    });
  });

  /** Signed-in agent, returning the CSRF token every mutation needs. */
  async function signedIn() {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    csrfToken = login.body.csrfToken as string;
    return agent;
  }

  it('moves a record to the trash and out of the list (API-A14)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await agent
      .delete(`/api/v1/admin/applications/${created._id.toString()}`)
      .set('X-CSRF-Token', csrfToken);

    expect(response.status).toBe(200);
    expect(response.body.deletedAt).toEqual(expect.any(String));

    const list = await agent.get('/api/v1/admin/applications');
    expect(list.body.data).toHaveLength(0);

    const trash = await agent.get('/api/v1/admin/trash');
    expect(trash.body.data).toHaveLength(1);
    expect(trash.body.data[0].id).toBe(created._id.toString());
  });

  it('keeps the trash view free of sensitive fields', async () => {
    const created = await seedApplication({ withPhoto: true });
    const agent = await signedIn();
    await agent
      .delete(`/api/v1/admin/applications/${created._id.toString()}`)
      .set('X-CSRF-Token', csrfToken);

    const trash = await agent.get('/api/v1/admin/trash');
    const serialised = JSON.stringify(trash.body);

    expect(serialised).not.toContain('TEST-health-marker');
    expect(serialised).not.toContain('1 Example Road');
    expect(serialised).not.toContain('08031234567');
    expect(serialised).not.toContain('test-photo.webp');
    expect(trash.body.data[0]).not.toHaveProperty('healthInformation');
    expect(trash.body.data[0]).not.toHaveProperty('photo');
  });

  it('restores a record with its original submission date (API-A15)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();
    const id = created._id.toString();

    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);
    const restored = await agent
      .post(`/api/v1/admin/applications/${id}/restore`)
      .set('X-CSRF-Token', csrfToken);

    expect(restored.status).toBe(200);

    const list = await agent.get('/api/v1/admin/applications');
    expect(list.body.data).toHaveLength(1);
    // The original timestamp survives, so ordering is unaffected.
    expect(list.body.data[0].submittedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('returns 404 when restoring a record that is not trashed', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await agent
      .post(`/api/v1/admin/applications/${created._id.toString()}/restore`)
      .set('X-CSRF-Token', csrfToken);

    expect(response.status).toBe(404);
  });

  it('rejects a permanent delete with the wrong confirm value (API-A16)', async () => {
    const created = await seedApplication();
    const agent = await signedIn();
    const id = created._id.toString();

    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);

    const response = await agent
      .delete(`/api/v1/admin/applications/${id}/permanent`)
      .set('X-CSRF-Token', csrfToken)
      .send({ confirm: '507f1f77bcf86cd799439011' });

    expect(response.status).toBe(422);
    expect(await Application.countDocuments({})).toBe(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('rejects a permanent delete with no confirm value', async () => {
    const created = await seedApplication();
    const agent = await signedIn();
    const id = created._id.toString();
    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);

    const response = await agent
      .delete(`/api/v1/admin/applications/${id}/permanent`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(response.status).toBe(422);
    expect(await Application.countDocuments({})).toBe(1);
  });

  it('deletes the photo, the document and writes an audit entry (API-A17, F-14)', async () => {
    const created = await seedApplication({ withPhoto: true });
    const agent = await signedIn();
    const id = created._id.toString();

    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);

    const response = await agent
      .delete(`/api/v1/admin/applications/${id}/permanent`)
      .set('X-CSRF-Token', csrfToken)
      .send({ confirm: id });

    expect(response.status).toBe(204);

    // Object removed before the document — the key proves it was targeted.
    expect(storage.remove).toHaveBeenCalledWith('applications/test-photo.webp');
    expect(await Application.countDocuments({})).toBe(0);

    const audit = await AuditLog.findOne({ action: 'application.permanently_deleted' }).lean();
    expect(audit).not.toBeNull();
    expect(audit?.targetId?.toString()).toBe(id);
    expect(audit?.targetType).toBe('application');
    expect(audit?.meta).toMatchObject({ hadPhoto: true });
    // The audit entry must not become a copy of what was deleted.
    expect(JSON.stringify(audit)).not.toContain('TEST-Trash');
    expect(JSON.stringify(audit)).not.toContain('TEST-health-marker');
  });

  it('keeps the record when the photo cannot be deleted (API-A18)', async () => {
    const created = await seedApplication({ withPhoto: true });
    const agent = await signedIn();
    const id = created._id.toString();

    await agent.delete(`/api/v1/admin/applications/${id}`).set('X-CSRF-Token', csrfToken);

    storage.remove.mockRejectedValueOnce(new Error('storage unavailable'));

    const response = await agent
      .delete(`/api/v1/admin/applications/${id}/permanent`)
      .set('X-CSRF-Token', csrfToken)
      .send({ confirm: id });

    expect(response.status).toBe(500);
    // The order is the control: object first means a failure here loses nothing.
    expect(await Application.countDocuments({})).toBe(1);
    // Scoped to the deletion action — signing in writes its own audit entry.
    expect(
      await AuditLog.countDocuments({ action: 'application.permanently_deleted' }),
    ).toBe(0);
  });

  it('refuses to permanently delete a record that is not in the trash', async () => {
    const created = await seedApplication();
    const agent = await signedIn();
    const id = created._id.toString();

    const response = await agent
      .delete(`/api/v1/admin/applications/${id}/permanent`)
      .set('X-CSRF-Token', csrfToken)
      .send({ confirm: id });

    expect(response.status).toBe(409);
    expect(await Application.countDocuments({})).toBe(1);
  });

  it('requires a CSRF token for a mutation', async () => {
    const created = await seedApplication();
    const agent = await signedIn();

    const response = await agent.delete(`/api/v1/admin/applications/${created._id.toString()}`);

    expect(response.status).toBe(403);
    expect(await Application.countDocuments({})).toBe(1);
  });

  it('requires a session for trash operations', async () => {
    const response = await request(app()).get('/api/v1/admin/trash');
    expect(response.status).toBe(401);
  });
});

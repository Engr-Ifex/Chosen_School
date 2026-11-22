/**
 * Enquiries and visit requests end to end — API-P13, API-P18, API-P20,
 * API-A33 to API-A38.
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
import { Enquiry } from '../models/enquiry.js';
import { RateLimit } from '../models/ratelimit.js';
import { Session } from '../models/session.js';
import { VisitRequest } from '../models/visitrequest.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

const APP_ORIGIN = 'http://localhost:5173';
const COOKIE_NAME = 'cs_test_session';
const EMAIL = 'admin@example.test';
const PASSWORD = 'a-very-long-test-password';

const app = () =>
  createApp({
    logger,
    trustProxyHops: 0,
    isProduction: false,
    appOrigin: APP_ORIGIN,
    sessionCookieName: COOKIE_NAME,
  });

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const enquiryBody = {
  name: 'TEST-Adaeze',
  phone: '0803 111 2222',
  section: 'primary',
  message: 'TEST message about Basic 2 places',
};

const visitBody = {
  name: 'TEST-Bello',
  phone: '08033334444',
  section: 'secondary',
  preferredDate: daysFromNow(7),
  preferredTime: '10:30',
};

describe.skipIf(!run)('enquiries and visit requests', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([
      Admin.syncIndexes(),
      Session.syncIndexes(),
      Enquiry.syncIndexes(),
      VisitRequest.syncIndexes(),
      RateLimit.syncIndexes(),
    ]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Admin.deleteMany({}),
      Session.deleteMany({}),
      Enquiry.deleteMany({}),
      VisitRequest.deleteMany({}),
      RateLimit.deleteMany({}),
    ]);
    const hashed = await hashPassword(PASSWORD);
    await Admin.create({
      email: EMAIL,
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      passwordParams: hashed.params,
      passwordUpdatedAt: new Date(),
    });
  });

  /** A signed-in agent plus the CSRF token mutations need. */
  async function signedIn() {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    return { agent, csrf: login.body.csrfToken as string };
  }

  const submitEnquiry = (body: Record<string, unknown> = enquiryBody) =>
    request(app()).post('/api/v1/public/enquiries').send(body);

  describe('public forms', () => {
    it('stores an enquiry and returns only its id (API-P20)', async () => {
      const response = await submitEnquiry();

      expect(response.status).toBe(201);
      expect(Object.keys(response.body)).toEqual(['id']);

      const stored = await Enquiry.findById(response.body.id).lean();
      expect(stored?.status).toBe('new');
      expect(stored?.phone).toBe('08031112222');
      expect(stored?.archivedAt).toBeNull();
    });

    it('ignores a status or archive date the visitor supplies (API-P18)', async () => {
      const response = await submitEnquiry({ ...enquiryBody, status: 'responded', archivedAt: new Date() });

      expect(response.status).toBe(201);
      const stored = await Enquiry.findById(response.body.id).lean();
      expect(stored?.status).toBe('new');
      expect(stored?.archivedAt).toBeNull();
    });

    it('stores a visit request', async () => {
      const response = await request(app()).post('/api/v1/public/visit-requests').send(visitBody);

      expect(response.status).toBe(201);
      expect(Object.keys(response.body)).toEqual(['id']);
      const stored = await VisitRequest.findById(response.body.id).lean();
      expect(stored?.preferredDate.toISOString()).toBe(`${visitBody.preferredDate}T00:00:00.000Z`);
      expect(stored?.preferredTime).toBe('10:30');
    });

    it('rejects preferredTime "3pm" with a field error (API-P13)', async () => {
      const response = await request(app())
        .post('/api/v1/public/visit-requests')
        .send({ ...visitBody, preferredTime: '3pm' });

      expect(response.status).toBe(422);
      expect(response.body.error.fields).toHaveProperty('preferredTime');
      expect(await VisitRequest.countDocuments()).toBe(0);
    });

    it('refuses a cross-site submission', async () => {
      const response = await submitEnquiry().set('Origin', 'https://attacker.example');
      expect(response.status).toBe(403);
    });
  });

  describe('admin inbox', () => {
    it('requires a session for every inbox route (API-A33)', async () => {
      const created = await submitEnquiry();
      const id = created.body.id as string;

      for (const [method, path] of [
        ['get', '/api/v1/admin/enquiries'],
        ['get', `/api/v1/admin/enquiries/${id}`],
        ['patch', `/api/v1/admin/enquiries/${id}`],
        ['post', `/api/v1/admin/enquiries/${id}/archive`],
        ['post', `/api/v1/admin/enquiries/${id}/unarchive`],
        ['get', '/api/v1/admin/visit-requests'],
      ] as const) {
        const response = await request(app())[method](path).send({ status: 'reviewed' });
        expect(response.status, `${method} ${path}`).toBe(401);
      }
    });

    it('lists without message bodies; the detail carries the message (API-A34)', async () => {
      const created = await submitEnquiry();
      const { agent } = await signedIn();

      const list = await agent.get('/api/v1/admin/enquiries');
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0]).not.toHaveProperty('message');
      expect(list.body.data[0].status).toBe('new');

      const detail = await agent.get(`/api/v1/admin/enquiries/${created.body.id}`);
      expect(detail.body.message).toBe(enquiryBody.message);
      expect(detail.body).not.toHaveProperty('__v');
    });

    it('searches by name prefix, case-insensitively, and by phone digits', async () => {
      await submitEnquiry();
      await submitEnquiry({ ...enquiryBody, name: 'TEST-Chinedu', phone: '08099998888' });
      const { agent } = await signedIn();

      const byName = await agent.get('/api/v1/admin/enquiries?q=test-ada');
      expect(byName.body.data.map((item: { name: string }) => item.name)).toEqual(['TEST-Adaeze']);

      const byPhone = await agent.get('/api/v1/admin/enquiries?q=0809 999 8888');
      expect(byPhone.body.data.map((item: { name: string }) => item.name)).toEqual(['TEST-Chinedu']);
    });

    it('changes status, records when, and filters by it (API-A36)', async () => {
      const created = await submitEnquiry();
      const { agent, csrf } = await signedIn();
      const path = `/api/v1/admin/enquiries/${created.body.id}`;

      const patched = await agent.patch(path).set('X-CSRF-Token', csrf).send({ status: 'reviewed' });
      expect(patched.status).toBe(200);
      expect(patched.body.status).toBe('reviewed');
      expect(patched.body.statusUpdatedAt).not.toBeNull();

      const reviewed = await agent.get('/api/v1/admin/enquiries?status=reviewed');
      expect(reviewed.body.meta.total).toBe(1);
      const fresh = await agent.get('/api/v1/admin/enquiries?status=new');
      expect(fresh.body.meta.total).toBe(0);

      // Setting the same status again changes nothing, including the timestamp.
      const again = await agent.patch(path).set('X-CSRF-Token', csrf).send({ status: 'reviewed' });
      expect(again.body.statusUpdatedAt).toBe(patched.body.statusUpdatedAt);
    });

    it('rejects any field but status, and the non-existent "confirmed" (API-A35)', async () => {
      const created = await request(app()).post('/api/v1/public/visit-requests').send(visitBody);
      const { agent, csrf } = await signedIn();
      const path = `/api/v1/admin/visit-requests/${created.body.id}`;

      const extra = await agent.patch(path).set('X-CSRF-Token', csrf).send({ status: 'reviewed', name: 'Changed' });
      expect(extra.status).toBe(422);
      expect(extra.body.error.fields).toHaveProperty('name');

      const confirmed = await agent.patch(path).set('X-CSRF-Token', csrf).send({ status: 'confirmed' });
      expect(confirmed.status).toBe(422);

      const stored = await VisitRequest.findById(created.body.id).lean();
      expect(stored?.name).toBe(visitBody.name);
      expect(stored?.status).toBe('new');
    });

    it('requires the CSRF token for a status change', async () => {
      const created = await submitEnquiry();
      const { agent } = await signedIn();

      const response = await agent.patch(`/api/v1/admin/enquiries/${created.body.id}`).send({ status: 'reviewed' });
      expect(response.status).toBe(403);
    });

    it('archives out of the active inbox and back, without deleting (API-A37)', async () => {
      const created = await submitEnquiry();
      const { agent, csrf } = await signedIn();
      const base = `/api/v1/admin/enquiries/${created.body.id}`;

      const archived = await agent.post(`${base}/archive`).set('X-CSRF-Token', csrf);
      expect(archived.status).toBe(200);
      expect(archived.body.archivedAt).not.toBeNull();

      expect((await agent.get('/api/v1/admin/enquiries')).body.meta.total).toBe(0);
      expect((await agent.get('/api/v1/admin/enquiries?archived=true')).body.meta.total).toBe(1);
      expect(await Enquiry.countDocuments()).toBe(1);

      // Archived records do not change status, and cannot be archived twice.
      const patch = await agent.patch(base).set('X-CSRF-Token', csrf).send({ status: 'responded' });
      expect(patch.status).toBe(409);
      const twice = await agent.post(`${base}/archive`).set('X-CSRF-Token', csrf);
      expect(twice.status).toBe(409);

      const restored = await agent.post(`${base}/unarchive`).set('X-CSRF-Token', csrf);
      expect(restored.status).toBe(200);
      expect(restored.body.archivedAt).toBeNull();
      expect((await agent.get('/api/v1/admin/enquiries')).body.meta.total).toBe(1);
    });

    it('has no delete route (API-A38, Q11)', async () => {
      const created = await submitEnquiry();
      const { agent, csrf } = await signedIn();

      const response = await agent.delete(`/api/v1/admin/enquiries/${created.body.id}`).set('X-CSRF-Token', csrf);
      expect(response.status).toBe(404);
      expect(await Enquiry.countDocuments()).toBe(1);
    });

    it('lists visit requests soonest first, with date and time', async () => {
      await request(app()).post('/api/v1/public/visit-requests').send({ ...visitBody, name: 'TEST-Later', preferredDate: daysFromNow(14) });
      await request(app()).post('/api/v1/public/visit-requests').send({ ...visitBody, name: 'TEST-Sooner', preferredDate: daysFromNow(2) });
      const { agent } = await signedIn();

      const list = await agent.get('/api/v1/admin/visit-requests');
      expect(list.body.data.map((item: { name: string }) => item.name)).toEqual(['TEST-Sooner', 'TEST-Later']);
      expect(list.body.data[0].preferredTime).toBe('10:30');
    });

    it('distinguishes a malformed id (422) from a missing one (404)', async () => {
      const { agent } = await signedIn();
      expect((await agent.get('/api/v1/admin/enquiries/not-an-id')).status).toBe(422);
      expect((await agent.get('/api/v1/admin/enquiries/507f1f77bcf86cd799439011')).status).toBe(404);
    });
  });
});

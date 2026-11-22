/**
 * Announcements, events and categories end to end — API-P03, API-P04,
 * API-A19 to API-A22, API-A39 to API-A42, E2E-09/E2E-10 at API level.
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
import { Announcement } from '../models/announcement.js';
import { AuditLog } from '../models/auditlog.js';
import { Category } from '../models/category.js';
import { RateLimit } from '../models/ratelimit.js';
import { Session } from '../models/session.js';

const run = process.env.RUN_DB_TESTS === '1';
const APP_ORIGIN = 'http://localhost:5173';
const EMAIL = 'admin@example.test';
const PASSWORD = 'a-very-long-test-password';

const app = () =>
  createApp({
    logger: createLogger('error'),
    trustProxyHops: 0,
    isProduction: false,
    appOrigin: APP_ORIGIN,
    sessionCookieName: 'cs_test_session',
  });

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const announcement = (overrides: Record<string, unknown> = {}) => ({
  kind: 'announcement',
  title: 'TEST Resumption date',
  body: '<p>School resumes on <strong>Monday</strong>.</p>',
  ...overrides,
});

const event = (overrides: Record<string, unknown> = {}) => ({
  kind: 'event',
  title: 'TEST PTA meeting',
  body: '<p>All parents welcome.</p>',
  event: { startDate: day(7), endDate: day(7) },
  ...overrides,
});

describe.skipIf(!run)('announcements and events', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([
      Admin.syncIndexes(),
      Session.syncIndexes(),
      Announcement.syncIndexes(),
      Category.syncIndexes(),
      AuditLog.syncIndexes(),
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
      Announcement.deleteMany({}),
      Category.deleteMany({}),
      AuditLog.deleteMany({}),
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

  async function signedIn() {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const csrf = login.body.csrfToken as string;
    const post = (path: string, body?: object) => agent.post(path).set('X-CSRF-Token', csrf).send(body ?? {});
    const patch = (path: string, body: object) => agent.patch(path).set('X-CSRF-Token', csrf).send(body);
    const del = (path: string) => agent.delete(path).set('X-CSRF-Token', csrf);
    return { agent, post, patch, del };
  }

  async function createPublished(body: object) {
    const admin = await signedIn();
    const created = await admin.post('/api/v1/admin/announcements', body);
    expect(created.status).toBe(201);
    const published = await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);
    expect(published.status).toBe(200);
    return created.body.id as string;
  }

  describe('creating', () => {
    it('always creates a draft, and refuses status or publishedAt (API-A19)', async () => {
      const { post } = await signedIn();

      const sneaky = await post('/api/v1/admin/announcements', announcement({ status: 'published', isUrgent: true }));
      expect(sneaky.status).toBe(422);
      expect(sneaky.body.error.fields.status).toMatch(/publishing is a separate action/);
      const alsoSneaky = await post('/api/v1/admin/announcements', announcement({ publishedAt: new Date() }));
      expect(alsoSneaky.status).toBe(422);
      expect(await Announcement.countDocuments()).toBe(0);

      const ok = await post('/api/v1/admin/announcements', announcement({ isUrgent: true }));
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe('draft');
      expect(ok.body.publishedAt).toBeNull();
    });

    it('requires event dates for an event, and refuses them on an announcement (API-A21)', async () => {
      const { post } = await signedIn();
      const noDates = await post('/api/v1/admin/announcements', event({ event: undefined }));
      expect(noDates.status).toBe(422);
      expect(noDates.body.error.fields).toHaveProperty('event');

      const datesOnNews = await post('/api/v1/admin/announcements', announcement({ event: { startDate: day(1), endDate: day(1) } }));
      expect(datesOnNews.status).toBe(422);
    });

    it('refuses an end date before the start date (API-A22)', async () => {
      const { post } = await signedIn();
      const response = await post('/api/v1/admin/announcements', event({ event: { startDate: day(5), endDate: day(4) } }));
      expect(response.status).toBe(422);
      expect(response.body.error.fields).toHaveProperty('event.endDate');
    });

    it('sanitises the body before storing it (API-A39)', async () => {
      const { post } = await signedIn();
      const response = await post(
        '/api/v1/admin/announcements',
        announcement({ body: '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">link</a></p>' }),
      );
      expect(response.status).toBe(201);
      const stored = await Announcement.findById(response.body.id).lean();
      expect(stored?.body).toBe('<p>Hi link</p>');
    });

    it('refuses a body with no visible text', async () => {
      const { post } = await signedIn();
      const response = await post('/api/v1/admin/announcements', announcement({ body: '<p><script>x</script></p>' }));
      expect(response.status).toBe(422);
      expect(response.body.error.fields).toHaveProperty('body');
    });
  });

  describe('publishing', () => {
    it('makes an item public only after publish (E2E-09), and audits it', async () => {
      const admin = await signedIn();
      const created = await admin.post('/api/v1/admin/announcements', announcement());

      const before = await request(app()).get('/api/v1/public/announcements');
      expect(before.body.data).toHaveLength(0);

      const published = await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);
      expect(published.body.status).toBe('published');
      expect(published.body.publishedAt).not.toBeNull();

      const after = await request(app()).get('/api/v1/public/announcements');
      expect(after.body.data.map((item: { title: string }) => item.title)).toEqual(['TEST Resumption date']);
      expect(after.body.data[0]).not.toHaveProperty('status');

      expect(await AuditLog.countDocuments({ action: 'announcement.published' })).toBe(1);
    });

    it('returns 409 on a second publish (API-A20)', async () => {
      const admin = await signedIn();
      const created = await admin.post('/api/v1/admin/announcements', announcement());
      await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);
      const again = await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);
      expect(again.status).toBe(409);
    });

    it('unpublishes back to draft, removing it publicly, and keeps the first publish date', async () => {
      const admin = await signedIn();
      const created = await admin.post('/api/v1/admin/announcements', announcement());
      const first = await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);

      const unpublished = await admin.post(`/api/v1/admin/announcements/${created.body.id}/unpublish`);
      expect(unpublished.body.status).toBe('draft');
      expect((await request(app()).get('/api/v1/public/announcements')).body.data).toHaveLength(0);
      expect((await admin.post(`/api/v1/admin/announcements/${created.body.id}/unpublish`)).status).toBe(409);

      const republished = await admin.post(`/api/v1/admin/announcements/${created.body.id}/publish`);
      expect(republished.body.publishedAt).toBe(first.body.publishedAt);
    });

    it('requires a session and the CSRF token (API-A40)', async () => {
      const created = await (await signedIn()).post('/api/v1/admin/announcements', announcement());
      expect((await request(app()).post(`/api/v1/admin/announcements/${created.body.id}/publish`)).status).toBe(401);
      expect((await request(app()).get('/api/v1/admin/announcements')).status).toBe(401);

      const { agent } = await signedIn();
      expect((await agent.post(`/api/v1/admin/announcements/${created.body.id}/publish`)).status).toBe(403);
    });
  });

  describe('public visibility', () => {
    it('shows only published, unexpired items (API-P03, E2E-10)', async () => {
      const admin = await signedIn();
      await admin.post('/api/v1/admin/announcements', announcement({ title: 'TEST Draft' }));
      await createPublished(announcement({ title: 'TEST Live' }));
      await createPublished(announcement({ title: 'TEST Expired', expiresAt: new Date(Date.now() - 60_000).toISOString() }));
      await createPublished(announcement({ title: 'TEST Expires later', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }));

      const titles = (await request(app()).get('/api/v1/public/announcements')).body.data.map((i: { title: string }) => i.title).sort();
      expect(titles).toEqual(['TEST Expires later', 'TEST Live']);

      // The expired item stays visible to the admin, marked as expired.
      const list = await admin.agent.get('/api/v1/admin/announcements');
      const expired = list.body.data.find((i: { title: string }) => i.title === 'TEST Expired');
      expect(expired).toMatchObject({ status: 'published', isExpired: true, isPublic: false });
    });

    it('lists events soonest first and drops events that have ended (API-P04)', async () => {
      await createPublished(event({ title: 'TEST Later', event: { startDate: day(20), endDate: day(21) } }));
      await createPublished(event({ title: 'TEST Sooner', event: { startDate: day(3), endDate: day(3) } }));
      await createPublished(event({ title: 'TEST Ended', event: { startDate: day(-5), endDate: day(-3) } }));
      await createPublished(event({ title: 'TEST Ongoing', event: { startDate: day(-2), endDate: day(2) } }));

      const response = await request(app()).get('/api/v1/public/events');
      expect(response.body.data.map((i: { title: string }) => i.title)).toEqual(['TEST Ongoing', 'TEST Sooner', 'TEST Later']);
      // Events never appear in the announcements tab, and vice versa.
      expect((await request(app()).get('/api/v1/public/announcements')).body.data).toHaveLength(0);
    });

    it('does not let urgency change ordering or visibility', async () => {
      const admin = await signedIn();
      await admin.post('/api/v1/admin/announcements', announcement({ title: 'TEST Urgent draft', isUrgent: true }));
      await createPublished(announcement({ title: 'TEST Older urgent', isUrgent: true }));
      await createPublished(announcement({ title: 'TEST Newer normal' }));

      const titles = (await request(app()).get('/api/v1/public/announcements')).body.data.map((i: { title: string }) => i.title);
      expect(titles).toEqual(['TEST Newer normal', 'TEST Older urgent']);
    });
  });

  describe('editing and deleting', () => {
    it('updates fields, sanitising the body, and refuses status (API-A41)', async () => {
      const admin = await signedIn();
      const created = await admin.post('/api/v1/admin/announcements', announcement());
      const path = `/api/v1/admin/announcements/${created.body.id}`;

      const edited = await admin.patch(path, { title: 'TEST Edited', body: '<p>New <b>text</b></p>' });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ title: 'TEST Edited', body: '<p>New <strong>text</strong></p>', status: 'draft' });

      expect((await admin.patch(path, { status: 'published' })).status).toBe(422);
      expect((await admin.patch(path, { kind: 'event' })).status).toBe(422);
    });

    it('deletes permanently and audits it', async () => {
      const admin = await signedIn();
      const id = await createPublished(announcement());
      expect((await admin.del(`/api/v1/admin/announcements/${id}`)).status).toBe(204);
      expect(await Announcement.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments({ action: 'announcement.deleted' })).toBe(1);
      expect((await admin.agent.get(`/api/v1/admin/announcements/${id}`)).status).toBe(404);
    });
  });

  describe('categories', () => {
    it('creates, filters by, and refuses deleting a category in use (API-A42)', async () => {
      const admin = await signedIn();
      const category = await admin.post('/api/v1/admin/categories', { scope: 'announcement', name: 'PTA Meetings' });
      expect(category.status).toBe(201);
      expect(category.body.slug).toBe('pta-meetings');

      const duplicate = await admin.post('/api/v1/admin/categories', { scope: 'announcement', name: 'PTA meetings' });
      expect(duplicate.status).toBe(409);

      await createPublished(announcement({ title: 'TEST In category', categoryId: category.body.id }));
      await createPublished(announcement({ title: 'TEST Uncategorised' }));

      const filtered = await request(app()).get('/api/v1/public/announcements?category=pta-meetings');
      expect(filtered.body.data.map((i: { title: string }) => i.title)).toEqual(['TEST In category']);
      expect(filtered.body.data[0].category).toMatchObject({ name: 'PTA Meetings', slug: 'pta-meetings' });

      const blocked = await admin.del(`/api/v1/admin/categories/${category.body.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.message).toMatch(/used by 1 item/);
    });

    it('rejects an announcement pointing at a category that does not exist', async () => {
      const { post } = await signedIn();
      const response = await post('/api/v1/admin/announcements', announcement({ categoryId: '507f1f77bcf86cd799439011' }));
      expect(response.status).toBe(422);
      expect(response.body.error.fields).toHaveProperty('categoryId');
    });

    it('deletes an unused category', async () => {
      const admin = await signedIn();
      const category = await admin.post('/api/v1/admin/categories', { scope: 'announcement', name: 'Holidays' });
      expect((await admin.del(`/api/v1/admin/categories/${category.body.id}`)).status).toBe(204);
      expect((await admin.agent.get('/api/v1/admin/categories?scope=announcement')).body.data).toHaveLength(0);
    });
  });
});

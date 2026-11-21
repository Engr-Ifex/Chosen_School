/**
 * Rate limiting against a real database — API_SPEC §1.8, TEST_PLAN T3 (local
 * equivalent).
 *
 * Opt-in, because it needs a real `mongod`:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * The concurrency test is the reason this file exists. The limiter used to
 * read the count and write it in two calls, so a burst of parallel requests
 * could all see the same count and all be allowed.
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
import { RateLimit } from '../models/ratelimit.js';
import { Session } from '../models/session.js';
import { consumeLimit, LIMITS } from './rate-limit.js';

const logger = createLogger('error');
const run = process.env.RUN_DB_TESTS === '1';

const APP_ORIGIN = 'http://localhost:5173';
const COOKIE_NAME = 'cs_test_session';
const EMAIL = 'admin@example.test';
const PASSWORD = 'a-very-long-test-password';
const HOUR = 60 * 60 * 1000;

/** One hop trusted, so `X-Forwarded-For` stands in for distinct visitors. */
const app = () =>
  createApp({
    logger,
    trustProxyHops: 1,
    isProduction: false,
    appOrigin: APP_ORIGIN,
    sessionCookieName: COOKIE_NAME,
  });

function payload(): Record<string, unknown> {
  return {
    student: { surname: 'TEST-Applicant', firstName: 'Ada', dateOfBirth: '2015-04-02', gender: 'female' },
    guardian: { name: 'TEST-Guardian', homeAddress: '1 Example Road', phone: '08031234567' },
    placement: { section: 'primary', classApplyingFor: 'Basic 1' },
    signature: { typedName: 'TEST-Guardian' },
  };
}

describe.skipIf(!run)('rate limiting (database)', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([
      RateLimit.syncIndexes(),
      Admin.syncIndexes(),
      Application.syncIndexes(),
      Session.syncIndexes(),
    ]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      RateLimit.deleteMany({}),
      Admin.deleteMany({}),
      Application.deleteMany({}),
      Session.deleteMany({}),
    ]);
  });

  describe('consumeLimit', () => {
    it('allows exactly max attempts out of a parallel burst', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => consumeLimit('burst', HOUR, 5)),
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      expect(await RateLimit.countDocuments({ key: 'burst' })).toBe(1);
    });

    it('starts a fresh window once the old one has ended', async () => {
      await RateLimit.create({
        key: 'stale',
        count: 99,
        windowStart: new Date(Date.now() - 2 * HOUR),
        expiresAt: new Date(Date.now() - HOUR),
      });

      const result = await consumeLimit('stale', HOUR, 5);
      const doc = await RateLimit.findOne({ key: 'stale' }).lean();

      expect(result.allowed).toBe(true);
      expect(doc?.count).toBe(1);
      expect(doc!.windowStart.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(doc!.expiresAt.getTime()).toBeGreaterThan(Date.now() + HOUR - 60_000);
    });

    it('keeps the window fixed while blocked attempts arrive', async () => {
      for (let i = 0; i < 5; i += 1) await consumeLimit('fixed', HOUR, 5);
      const before = await RateLimit.findOne({ key: 'fixed' }).lean();

      const blocked = await consumeLimit('fixed', HOUR, 5);
      const after = await RateLimit.findOne({ key: 'fixed' }).lean();

      expect(blocked.allowed).toBe(false);
      expect(after!.windowStart.getTime()).toBe(before!.windowStart.getTime());
    });
  });

  describe('POST /public/applications', () => {
    it(`allows ${LIMITS.applicationSubmit.max} submissions per IP per hour, then 429`, async () => {
      for (let i = 0; i < LIMITS.applicationSubmit.max; i += 1) {
        const ok = await request(app())
          .post('/api/v1/public/applications')
          .set('X-Forwarded-For', '203.0.113.7')
          .send(payload());
        expect(ok.status).toBe(201);
      }

      const blocked = await request(app())
        .post('/api/v1/public/applications')
        .set('X-Forwarded-For', '203.0.113.7')
        .send(payload());

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(await Application.countDocuments()).toBe(LIMITS.applicationSubmit.max);
    });

    it('does not throttle a different visitor', async () => {
      for (let i = 0; i <= LIMITS.applicationSubmit.max; i += 1) {
        await request(app())
          .post('/api/v1/public/applications')
          .set('X-Forwarded-For', '203.0.113.7')
          .send(payload());
      }

      const other = await request(app())
        .post('/api/v1/public/applications')
        .set('X-Forwarded-For', '198.51.100.9')
        .send(payload());

      expect(other.status).toBe(201);
    });

    it('records the visitor IP in the counter key, not the proxy', async () => {
      await request(app())
        .post('/api/v1/public/applications')
        .set('X-Forwarded-For', '203.0.113.7')
        .send(payload());

      expect(await RateLimit.findOne({ key: 'submit:application:ip:203.0.113.7' })).not.toBeNull();
    });
  });

  describe('admin PDF export', () => {
    it(`allows ${LIMITS.adminPdf.max} exports per session per hour, then 429`, async () => {
      const hashed = await hashPassword(PASSWORD);
      await Admin.create({
        email: EMAIL,
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        passwordParams: hashed.params,
        passwordUpdatedAt: new Date(),
      });

      const agent = request.agent(app());
      await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

      // An unknown id is a 404 after the limiter, which is enough to consume
      // the counter without rendering 20 PDFs.
      const path = '/api/v1/admin/applications/507f1f77bcf86cd799439011/pdf';

      for (let i = 0; i < LIMITS.adminPdf.max; i += 1) {
        const response = await agent.get(path);
        expect(response.status).toBe(404);
      }

      const blocked = await agent.get(path);
      expect(blocked.status).toBe(429);

      // The tighter PDF limit does not lock the administrator out of the rest
      // of the dashboard.
      const list = await agent.get('/api/v1/admin/applications');
      expect(list.status).toBe(200);
    });
  });
});

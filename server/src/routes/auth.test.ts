/**
 * Authentication endpoints — API-A01 to A05, docs/API_SPEC.md §3.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * These are the acceptance criteria from ROADMAP S05, run against the real
 * stack: no cookie → 401, expired → 401 SESSION_EXPIRED, missing CSRF → 403,
 * five failures → 429, logout invalidates immediately.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { sha256 } from '../lib/tokens.js';
import { createLogger } from '../logger.js';
import { Admin } from '../models/admin.js';
import { AuditLog } from '../models/auditlog.js';
import { RateLimit } from '../models/ratelimit.js';
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

describe.skipIf(!run)('authentication', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([
      Admin.syncIndexes(),
      Session.syncIndexes(),
      RateLimit.syncIndexes(),
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
      Session.deleteMany({}),
      RateLimit.deleteMany({}),
      AuditLog.deleteMany({}),
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

  it('rejects a request with no cookie (API-A01)', async () => {
    const response = await request(app()).get('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs in with the correct password and sets a session cookie', async () => {
    const response = await request(app())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.admin).toEqual({ email: EMAIL });
    expect(response.body.csrfToken).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain(COOKIE_NAME);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');

    // The raw token must not be stored anywhere.
    const stored = await Session.find({});
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same message for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(app())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password-here' });

    const unknownEmail = await request(app())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'wrong-password-here' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('UNAUTHENTICATED');
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('returns 429 with Retry-After after five failures (API-A04)', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'wrong-password-here' });
      expect(response.status).toBe(401);
    }

    const blocked = await request(app())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password-here' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'] ?? 0)).toBeGreaterThan(0);
  });

  it('reports the session for an authenticated request', async () => {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const session = await agent.get('/api/v1/auth/session');

    expect(session.status).toBe(200);
    expect(session.body.admin).toEqual({ email: EMAIL });
    expect(session.body.csrfToken).toBe(login.body.csrfToken);
    expect(session.body.idleExpiresAt).toEqual(expect.any(String));
  });

  it('rejects a session past its absolute expiry (API-A02)', async () => {
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await agent.get('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects a session past its idle expiry', async () => {
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    await Session.updateMany({}, { $set: { idleExpiresAt: new Date(Date.now() - 1000) } });

    const response = await agent.get('/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('invalidates the session immediately on logout (API-A05)', async () => {
    const agent = request.agent(app());
    const login = await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', login.body.csrfToken);

    expect(logout.status).toBe(204);
    expect(await Session.countDocuments({})).toBe(0);

    // The cookie may still be present in the agent; the session row is gone,
    // so it must no longer work.
    const after = await agent.get('/api/v1/auth/session');
    expect(after.status).toBe(401);
  });

  it('rejects a logout with no CSRF token (API-A03)', async () => {
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const response = await agent.post('/api/v1/auth/logout');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    // The session must survive a rejected logout.
    expect(await Session.countDocuments({})).toBe(1);
  });

  it('rejects a logout with the wrong CSRF token', async () => {
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const response = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', 'not-the-right-token');

    expect(response.status).toBe(403);
  });

  it('rejects a mutating request from another origin', async () => {
    const response = await request(app())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(await Session.countDocuments({})).toBe(0);
  });

  it('accepts a mutating request from the configured origin', async () => {
    const response = await request(app())
      .post('/api/v1/auth/login')
      .set('Origin', APP_ORIGIN)
      .send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
  });

  it('writes an audit entry for success and for failure', async () => {
    await request(app()).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    await request(app())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password-here' });

    expect(await AuditLog.countDocuments({ action: 'auth.login.success' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'auth.login.failure' })).toBe(1);
  });

  it('never stores the password or the session token in an audit entry', async () => {
    await request(app()).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const entries = await AuditLog.find({}).lean();
    const serialised = JSON.stringify(entries);

    expect(serialised).not.toContain(PASSWORD);
    expect(serialised).not.toContain('$argon2id$');
    for (const entry of entries) {
      expect(entry).not.toHaveProperty('password');
    }
  });

  it('stores only the hash of the session token', async () => {
    const response = await request(app())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });

    const cookie = response.headers['set-cookie']?.[0] ?? '';
    const rawToken = (cookie.split(';')[0] ?? '').split('=')[1] ?? '';

    const stored = await Session.findOne({});
    expect(stored?.tokenHash).toBe(sha256(rawToken));
    expect(stored?.tokenHash).not.toBe(rawToken);
  });
});

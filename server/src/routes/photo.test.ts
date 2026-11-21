/**
 * Photo upload end to end — TEST_PLAN F-01 to F-10.
 *
 * Opt-in, because it needs a real database:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * Storage is redirected to a temporary directory before any module loads, so
 * nothing is written into the repository.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const storageRoot = await mkdtemp(join(tmpdir(), 'chosen-photo-'));
process.env.STORAGE_DIR = storageRoot;

const { createApp } = await import('../app.js');
const { connectDatabase, disconnectDatabase } = await import('../db.js');
const { hashPassword } = await import('../lib/password.js');
const { createLogger } = await import('../logger.js');
const { Admin } = await import('../models/admin.js');
const { Application } = await import('../models/application.js');
const { Session } = await import('../models/session.js');
const { RateLimit } = await import('../models/ratelimit.js');

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

function payload(): Record<string, unknown> {
  return {
    student: {
      surname: 'TEST-Photo',
      firstName: 'Amara',
      dateOfBirth: '2015-04-02',
      gender: 'female',
    },
    guardian: { name: 'TEST-Guardian', homeAddress: '1 Example Road', phone: '08031234567' },
    placement: { section: 'primary', classApplyingFor: 'Basic 1' },
    signature: { typedName: 'TEST-Guardian' },
  };
}

async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 80, height: 60, channels: 3, background: '#336699' } })
    .jpeg()
    .toBuffer();
}

describe.skipIf(!run)('photo upload', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');
    await Promise.all([Admin.syncIndexes(), Application.syncIndexes(), Session.syncIndexes()]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
    await rm(storageRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Counters cleared too: this file submits more than the 5-per-hour public
    // limit from one address, and the limit is not what it is testing.
    await Promise.all([
      Admin.deleteMany({}),
      Application.deleteMany({}),
      Session.deleteMany({}),
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
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    return agent;
  }

  it('accepts a submission with a photo and stores a WebP', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', await jpeg(), 'photo.jpg');

    expect(response.status).toBe(201);

    const stored = await Application.findById(response.body.id);
    expect(stored?.photo).not.toBeNull();
    expect(stored?.photo?.contentType).toBe('image/webp');
    expect(stored?.photo?.key).toMatch(/^applications\/[0-9a-f-]{36}\.webp$/);
    expect(stored?.photo?.width).toBe(80);
  });

  it('reports hasPhoto in the admin list', async () => {
    await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', await jpeg(), 'photo.jpg');

    const agent = await signedIn();
    const list = await agent.get('/api/v1/admin/applications');

    expect(list.body.data[0].hasPhoto).toBe(true);
  });

  it('streams the photo with no-store and nosniff', async () => {
    const created = await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', await jpeg(), 'photo.jpg');

    const agent = await signedIn();
    const photo = await agent.get(`/api/v1/admin/applications/${created.body.id}/photo`);

    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toContain('image/webp');
    expect(photo.headers['cache-control']).toBe('private, no-store');
    expect(photo.headers['x-content-type-options']).toBe('nosniff');
    expect(photo.headers['content-disposition']).toContain('inline');
    // Never a redirect to a public URL.
    expect(photo.headers.location).toBeUndefined();
  });

  it('denies an unauthenticated photo request (F-10)', async () => {
    const created = await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', await jpeg(), 'photo.jpg');

    const response = await request(app()).get(
      `/api/v1/admin/applications/${created.body.id}/photo`,
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 for an application with no photo', async () => {
    const created = await request(app())
      .post('/api/v1/public/applications')
      .send(payload());

    const agent = await signedIn();
    const response = await agent.get(`/api/v1/admin/applications/${created.body.id}/photo`);

    expect(response.status).toBe(404);
  });

  it('rejects an SVG upload (F-04)', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'x.svg');

    expect(response.status).toBe(415);
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('rejects an oversized upload (F-03)', async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0xff);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;

    const response = await request(app())
      .post('/api/v1/public/applications')
      .field('payload', JSON.stringify(payload()))
      .attach('photo', oversized, 'big.jpg');

    expect(response.status).toBe(413);
    expect(await Application.countDocuments({})).toBe(0);
  });

  it('still accepts a JSON submission with no photo', async () => {
    const response = await request(app()).post('/api/v1/public/applications').send(payload());

    expect(response.status).toBe(201);
    const stored = await Application.findById(response.body.id);
    expect(stored?.photo ?? null).toBeNull();
  });

  it('rejects multipart without a payload part', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .attach('photo', await jpeg(), 'photo.jpg');

    expect(response.status).toBe(422);
  });
});

/**
 * Photographs in PDF exports (ADR-034). Lives here, not in pdf.test.ts,
 * because this file already points storage at a temporary directory.
 */
describe.skipIf(!run)('photographs in PDF exports', () => {
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
    await Promise.all([
      Admin.deleteMany({}),
      Application.deleteMany({}),
      Session.deleteMany({}),
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

  /** Collects the raw bytes; supertest would otherwise try to parse them. */
  // At runtime the parser receives the raw response stream; superagent's types
  // describe it as its own Response, hence the narrowing.
  const binary: Parameters<request.Test['parse']>[0] = (res, done) => {
    const stream = res as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => done(null, Buffer.concat(chunks)));
  };

  const imageCount = (pdf: Buffer): number =>
    (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;

  async function submit(withPhoto: boolean): Promise<string> {
    const base = request(app()).post('/api/v1/public/applications');
    const response = withPhoto
      ? await base.field('payload', JSON.stringify(payload())).attach('photo', await jpeg(), 'photo.jpg')
      : await base.send(payload());
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  it('embeds each record photograph in a bulk export', async () => {
    const ids = [await submit(true), await submit(false), await submit(true)];
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const response = await agent
      .get(`/api/v1/admin/applications/pdf?ids=${ids.join(',')}`)
      .buffer(true)
      .parse(binary);

    expect(response.status).toBe(200);
    // Two of the three records have a photograph.
    expect(imageCount(response.body as Buffer)).toBe(2);
  });

  it('embeds the photograph in a single export', async () => {
    const id = await submit(true);
    const agent = request.agent(app());
    await agent.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });

    const response = await agent
      .get(`/api/v1/admin/applications/${id}/pdf`)
      .buffer(true)
      .parse(binary);

    expect(response.status).toBe(200);
    expect(imageCount(response.body as Buffer)).toBe(1);
  });
});

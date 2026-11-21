/**
 * Rate-limit decision logic and middleware, without a database.
 *
 * The model is replaced so these run on every `npm test`. What they prove is
 * the part that lives in this module: the allow/deny decision is taken from
 * the value the single atomic update returns, `Retry-After` is honest, a
 * first-insert race is retried, and keys are namespaced. That the pipeline
 * update itself resets and increments correctly — and stays correct under
 * concurrency — needs a real `mongod`, and is in `rate-limit.db.test.ts`.
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOneAndUpdate = vi.fn();

vi.mock('../models/ratelimit.js', () => ({
  RateLimit: {
    collection: { findOneAndUpdate },
    deleteOne: vi.fn(),
  },
}));

const { consumeLimit, rateLimit, byIp, bySession } = await import('./rate-limit.js');
const { errorHandler } = await import('./error.js');
const { requestContext } = await import('./request.js');
const { createLogger } = await import('../logger.js');

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  findOneAndUpdate.mockReset();
});

describe('consumeLimit', () => {
  it('allows while the returned count is within the limit', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 5, windowStart: new Date() });

    await expect(consumeLimit('k', HOUR, 5)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('denies once the returned count passes the limit, with a real Retry-After', async () => {
    // Window opened 10 minutes ago, so about 50 minutes remain.
    findOneAndUpdate.mockResolvedValue({
      count: 6,
      windowStart: new Date(Date.now() - 10 * 60 * 1000),
    });

    const result = await consumeLimit('k', HOUR, 5);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(49 * 60);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(50 * 60);
  });

  it('makes exactly one database call per attempt — no read-then-write', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 1, windowStart: new Date() });

    await consumeLimit('k', HOUR, 5);

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0]!;
    expect(filter).toEqual({ key: 'k' });
    expect(Array.isArray(update)).toBe(true);
    expect(options).toMatchObject({ upsert: true, returnDocument: 'after' });
  });

  it('retries once when two first attempts race on the unique key', async () => {
    findOneAndUpdate
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
      .mockResolvedValueOnce({ count: 2, windowStart: new Date() });

    await expect(consumeLimit('k', HOUR, 5)).resolves.toMatchObject({ allowed: true });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('does not swallow other database errors', async () => {
    findOneAndUpdate.mockRejectedValue(new Error('network'));

    await expect(consumeLimit('k', HOUR, 5)).rejects.toThrow('network');
  });

  it('fails closed if the update returns nothing', async () => {
    findOneAndUpdate.mockResolvedValue(null);

    await expect(consumeLimit('k', HOUR, 5)).rejects.toThrow();
  });
});

describe('rateLimit middleware', () => {
  function app(max: number) {
    const server = express();
    server.set('trust proxy', 1);
    server.use(requestContext(createLogger('error')));
    server.post('/limited', rateLimit({ name: 'test', windowMs: HOUR, max, keyFor: byIp }), (_req, res) => {
      res.status(204).end();
    });
    server.use(errorHandler(createLogger('error')));
    return server;
  }

  it('passes the request through when allowed', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 1, windowStart: new Date() });

    const response = await request(app(5)).post('/limited');

    expect(response.status).toBe(204);
  });

  it('returns 429 RATE_LIMITED with Retry-After in the standard envelope', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 6, windowStart: new Date() });

    const response = await request(app(5)).post('/limited');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys the counter on the client IP from the proxy chain, namespaced', async () => {
    findOneAndUpdate.mockResolvedValue({ count: 1, windowStart: new Date() });

    await request(app(5)).post('/limited').set('X-Forwarded-For', '203.0.113.7');

    expect(findOneAndUpdate.mock.calls[0]![0]).toEqual({ key: 'test:ip:203.0.113.7' });
  });
});

describe('bySession', () => {
  it('keys on the session id', () => {
    const req = { auth: { sessionId: { toString: () => 'abc123' } } } as never;
    expect(bySession(req)).toBe('session:abc123');
  });

  it('refuses to run without a session — a wiring bug, not a client error', () => {
    expect(() => bySession({} as never)).toThrow();
  });
});

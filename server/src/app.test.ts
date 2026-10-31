/**
 * Application wiring: error envelope, request identity, headers.
 *
 * No database is needed here — these assertions are about the HTTP surface.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { AppError } from './errors.js';
import { createLogger } from './logger.js';

const logger = createLogger('error');

function app() {
  return createApp({ logger, trustProxyHops: 0, isProduction: false });
}

describe('application wiring', () => {
  it('returns the documented error envelope for an unknown route', async () => {
    const response = await request(app()).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });

  it('returns the envelope for a path outside the API prefix', async () => {
    const response = await request(app()).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('gives every request an id, echoed in the header and the body', async () => {
    const response = await request(app()).get('/api/v1/does-not-exist');

    const headerId = response.headers['x-request-id'];
    expect(headerId).toBeTruthy();
    expect(response.body.error.requestId).toBe(headerId);
  });

  it('does not advertise the framework', async () => {
    const response = await request(app()).get('/api/v1/does-not-exist');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the baseline security headers', async () => {
    const response = await request(app()).get('/api/v1/does-not-exist');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('rejects malformed JSON without leaking the parser error', async () => {
    const response = await request(app())
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toMatch(/Unexpected|position|token/i);
  });
});

describe('AppError', () => {
  it('maps a code to its documented status', () => {
    expect(new AppError('NOT_FOUND', 'gone').status).toBe(404);
    expect(new AppError('VALIDATION_ERROR', 'bad').status).toBe(422);
    expect(new AppError('SERVICE_UNAVAILABLE', 'down').status).toBe(503);
  });
});

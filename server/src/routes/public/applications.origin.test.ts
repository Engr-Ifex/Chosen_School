/**
 * `POST /public/applications` refuses cross-site requests — API_SPEC §2
 * ("origin-checked where mutating"), SECURITY §8.
 *
 * Runs without a database, and that is part of the point: the origin check is
 * mounted before the rate limiter and the body parser, so a refused request
 * is turned away without touching Atlas or buffering an upload. If the order
 * were reversed these would hang on the unconnected database instead of
 * returning 403.
 */

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createLogger } from '../../logger.js';

const APP_ORIGIN = 'http://localhost:5173';

const app = () =>
  createApp({ logger: createLogger('error'), trustProxyHops: 0, isProduction: false, appOrigin: APP_ORIGIN });

describe('POST /api/v1/public/applications — origin check', () => {
  it('refuses a request from another origin', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .set('Origin', 'https://attacker.example')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a request the browser marks as cross-site', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({});

    expect(response.status).toBe(403);
  });

  it('refuses a cross-site multipart upload before reading the file', async () => {
    const response = await request(app())
      .post('/api/v1/public/applications')
      .set('Origin', 'https://attacker.example')
      .field('payload', '{}')
      .attach('photo', Buffer.alloc(1024), 'photo.jpg');

    expect(response.status).toBe(403);
  });
});

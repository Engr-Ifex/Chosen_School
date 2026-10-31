/**
 * Express application factory.
 *
 * Deliberately does not call `listen`. Tests build an app and drive it directly,
 * so nothing binds a port and nothing depends on a fixed number.
 */

import express, { type Express, type RequestHandler } from 'express';
import { pingDatabase } from './db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestContext } from './middleware/request.js';
import type { Logger } from './logger.js';
import { healthRouter, type HealthProbe } from './routes/health.js';

export interface AppOptions {
  logger: Logger;
  /** Number of proxies to trust for client IP. Verified in TEST_PLAN T3. */
  trustProxyHops: number;
  isProduction: boolean;
  /**
   * Overrides the database probe. Defaults to the real one.
   * Injectable so the endpoint's 200/503 contract can be tested without
   * standing up a database; the real path is covered in db.integration.test.ts.
   */
  healthProbe?: HealthProbe;
}

/**
 * Headers that cost nothing and close obvious holes. The full set required by
 * docs/SECURITY.md §14.2 — including a Content-Security-Policy — belongs with
 * the client deployment, because a CSP has to name the origins actually used.
 */
const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

export function createApp(options: AppOptions): Express {
  const { logger, trustProxyHops, isProduction, healthProbe = pingDatabase } = options;
  const app = express();

  // Do not advertise the framework.
  app.disable('x-powered-by');

  // Without this, every request appears to come from the proxy and rate
  // limiting would throttle the whole internet as one client (§5.3).
  app.set('trust proxy', trustProxyHops);

  app.use(securityHeaders);

  if (isProduction) {
    // Only meaningful over HTTPS; set here so it is not forgotten at deploy.
    app.use((_req, res, next) => {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
  }

  app.use(requestContext(logger));

  // JSON bodies are capped at 100 KB per docs/API_SPEC.md §1.2. Uploads are
  // multipart and handled separately, with their own 5 MB cap.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1', healthRouter(healthProbe));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}

/**
 * Request identity and access logging.
 *
 * Every request gets an id, which is echoed to the client in the error envelope
 * and written to the log. That is what makes "the parent saw an error" a
 * findable event rather than a guess.
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logger.js';
import { redactPath } from '../logger.js';

export function requestContext(logger: Logger) {
  return function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info('request', {
        requestId,
        method: req.method,
        // Redacted: the concrete path can identify which child's record was
        // opened. The route pattern is enough to debug with.
        path: redactPath(req.path),
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  };
}

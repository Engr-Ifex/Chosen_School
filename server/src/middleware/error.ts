/**
 * Error handling. The only place that writes an error body.
 *
 * Two rules, both from docs/API_SPEC.md §1.4 and docs/SECURITY.md §12:
 *   1. The client receives a code, a message, and a request id — never a stack,
 *      a query, a connection string, or a submitted value.
 *   2. The server log receives the detail, tagged with the same request id.
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError, errorBody, type ErrorCode } from '../errors.js';
import type { Logger } from '../logger.js';

/** Unmatched route. Uses the same envelope so clients parse one shape. */
export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .json(errorBody('NOT_FOUND', 'The requested resource does not exist.', req.requestId));
}

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

export function errorHandler(logger: Logger) {
  return function errorHandlerMiddleware(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (res.headersSent) {
      // The response is already on its way; let Express close the connection.
      next(err);
      return;
    }

    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message, req.requestId, err.fields));
      return;
    }

    const parserError = err as BodyParserError;

    // body-parser signals an oversized body and malformed JSON with a `type`.
    if (parserError?.type === 'entity.too.large') {
      res
        .status(413)
        .json(errorBody('PAYLOAD_TOO_LARGE', 'The request body is too large.', req.requestId));
      return;
    }

    if (parserError?.type === 'entity.parse.failed') {
      res
        .status(422)
        .json(errorBody('VALIDATION_ERROR', 'The request body is not valid JSON.', req.requestId));
      return;
    }

    const status = parserError?.status ?? parserError?.statusCode;
    if (status === 400) {
      res
        .status(422)
        .json(errorBody('VALIDATION_ERROR', 'The request could not be understood.', req.requestId));
      return;
    }

    // Anything unhandled: log the detail, tell the client nothing.
    logger.error('unhandled_error', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    const code: ErrorCode = 'INTERNAL_ERROR';
    res.status(500).json(errorBody(code, 'Something went wrong. Please try again.', req.requestId));
  };
}

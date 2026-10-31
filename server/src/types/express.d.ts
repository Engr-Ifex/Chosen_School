import type { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the request middleware. Present on every request, including 404s. */
    requestId: string;
  }
}

export type { Request };

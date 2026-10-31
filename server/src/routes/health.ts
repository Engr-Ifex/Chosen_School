/**
 * Health endpoint — docs/API_SPEC.md §2.1, FR-040.
 *
 * What it must NOT say: database name, host, connection state detail, version,
 * uptime, memory, or any environment value. A health endpoint is public and is
 * exactly where that information leaks by accident.
 *
 * What it must do: answer honestly. A 200 that means "the process is running"
 * is worse than useless — it hides a dead database from the uptime monitor.
 */

import { Router } from 'express';

/** Returns true only when the database actually answered. */
export type HealthProbe = () => Promise<boolean>;

export function healthRouter(probe: HealthProbe): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    // A probe that throws means the database is not answering. Reporting 500
    // would be less accurate than reporting "unavailable", and would look like
    // an application bug to whoever is on call.
    const healthy = await probe().catch(() => false);

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
    });
  });

  return router;
}

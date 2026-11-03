/**
 * Index synchronisation — run deliberately, never on boot.
 *
 * AGENTS.md §8 forbids `autoIndex` and forbids calling `syncIndexes()` during
 * startup: an index build is a schema change, and a schema change that happens
 * automatically on deploy is a change nobody reviewed.
 *
 *   npm run sync-indexes --workspace server
 *
 * `syncIndexes()` drops indexes that are no longer declared. That is the point —
 * otherwise a removed index lingers — but it is also why this is a manual step
 * with a readable report rather than something hidden in a lifecycle hook.
 */

import { connectDatabase, disconnectDatabase } from '../db.js';
import { loadConfig } from '../config.js';
import { Admin } from '../models/admin.js';
import { AuditLog } from '../models/auditlog.js';
import { Application } from '../models/application.js';
import { RateLimit } from '../models/ratelimit.js';
import { Session } from '../models/session.js';
import { Settings } from '../models/settings.js';
import { createLogger } from '../logger.js';

const logger = createLogger('info');

const models = [
  ['admins', Admin],
  ['applications', Application],
  ['sessions', Session],
  ['auditlogs', AuditLog],
  ['ratelimits', RateLimit],
  ['settings', Settings],
] as const;

async function main(): Promise<void> {
  const config = loadConfig();
  await connectDatabase(config.mongoUri, config.mongoDbName);

  for (const [name, model] of models) {
    const dropped = await model.syncIndexes();
    logger.info('indexes_synced', {
      collection: name,
      dropped: Array.isArray(dropped) ? dropped.length : 0,
    });
  }

  await disconnectDatabase();
  logger.info('index_sync_complete');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Index sync failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

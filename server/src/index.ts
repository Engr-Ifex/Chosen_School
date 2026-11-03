/**
 * Bootstrap.
 *
 * Order matters: configuration is validated before the port is bound and before
 * the database is contacted. A server that starts with a broken configuration
 * fails later, in front of a user, with a stack trace instead of a message.
 */

import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigError, describePresence, loadConfig, type Config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { createLogger } from './logger.js';

const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'APP_ORIGIN',
  'SESSION_COOKIE_NAME',
  'TRUST_PROXY_HOPS',
  'LOG_LEVEL',
];

function readConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Named variables, no values. This is the whole point of failing at boot.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = readConfigOrExit();
  const logger = createLogger(config.logLevel);

  // Names only — never values.
  logger.info('boot', {
    nodeEnv: config.nodeEnv,
    ...describePresence(process.env, CONFIG_KEYS),
  });

  // Bad configuration stops the process. An unreachable database does not:
  // the process must stay up so /health can report 503 honestly. An uptime
  // monitor can distinguish "refused connection" from "reported unhealthy",
  // and only the second one tells you the application is running but the
  // database is not.
  try {
    await connectDatabase(config.mongoUri, config.mongoDbName);
    logger.info('database_connected');
  } catch (error) {
    logger.error('database_connection_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Reconnection is not implemented yet; the process serves 503 until it is
    // restarted. Tracked as deployment work in S14.
  }

  const app = createApp({
    logger,
    trustProxyHops: config.trustProxyHops,
    isProduction: config.nodeEnv === 'production',
    appOrigin: config.appOrigin,
    sessionCookieName: config.sessionCookieName,
  });

  const server: Server = app.listen(config.port, () => {
    logger.info('listening', { port: config.port });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutdown_started', { signal });

    // Stop accepting connections, then close the database, then exit. The
    // timeout guards against a hung socket holding the process open.
    const forceExit = setTimeout(() => {
      logger.error('shutdown_forced', { signal });
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => {
      void disconnectDatabase()
        .catch((error: unknown) => {
          logger.error('database_disconnect_failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          logger.info('shutdown_complete', { signal });
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  // Startup failures happen before the logger exists, so this is the one place
  // that writes an unstructured line.
  process.stderr.write(
    `Fatal startup error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

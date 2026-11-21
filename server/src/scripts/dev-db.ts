/**
 * Local development database — ADR-035.
 *
 *     npm run dev:db        (from the repository root)
 *
 * Starts the `mongod` binary the test tooling already pins, on
 * 127.0.0.1:27017, with its data kept in `server/.mongo-dev/` so it survives a
 * restart. Development never touches Atlas: `server/.env.development` points
 * `MONGODB_URI` here, and boot refuses a remote database in development.
 *
 * Uses `mongodb-memory-server` only to locate (or, the first time, download)
 * the binary — nothing here is in memory. It is a devDependency, so this file
 * is excluded from the production build in `tsconfig.json`.
 *
 * Runs in the foreground; Ctrl+C stops the database cleanly.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoBinary } from 'mongodb-memory-server';

/** Must match `MONGOMS_VERSION` in `vitest.config.ts`, so one download serves both. */
process.env.MONGOMS_VERSION ??= '6.0.14';

const PORT = 27017;
const HOST = '127.0.0.1';
const DATA_DIR = resolve(process.cwd(), '.mongo-dev');

mkdirSync(DATA_DIR, { recursive: true });

const binary = await MongoBinary.getPath();

process.stdout.write(
  `Local development database on ${HOST}:${PORT}\n` +
    `Data: ${DATA_DIR}\n` +
    'Press Ctrl+C to stop.\n',
);

// `--bind_ip` keeps it off the network: only this machine can connect, and
// there is no authentication on a local development database.
const mongod = spawn(binary, ['--dbpath', DATA_DIR, '--port', String(PORT), '--bind_ip', HOST, '--quiet'], {
  stdio: ['ignore', 'ignore', 'inherit'],
});

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  mongod.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

mongod.on('exit', (code) => {
  if (!stopping && code !== 0) {
    process.stderr.write(
      `mongod exited with code ${code}. If port ${PORT} is already in use, another MongoDB is ` +
        'running — stop it, or use that one.\n',
    );
  }
  process.exit(stopping ? 0 : (code ?? 1));
});

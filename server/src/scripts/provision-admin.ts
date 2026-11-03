/**
 * Provision or re-provision the single administrator account.
 *
 *   npm run provision-admin --workspace server
 *
 * Run this yourself, locally. The password is read from the terminal without
 * echo, never from an argument — arguments appear in shell history and in the
 * process list, where any local user can read them.
 *
 * There is no HTTP registration path by design (SECURITY §6.1): an endpoint that
 * creates administrators is an endpoint that can be attacked. Recovery is this
 * script, over a channel that is not the website.
 *
 * Re-running it rotates the password and **deletes every existing session**, so
 * a password change logs the old session out everywhere (DATA_MODEL §3).
 */

import { loadConfig } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { Admin } from '../models/admin.js';
import { Session } from '../models/session.js';
import { createLogger } from '../logger.js';

const logger = createLogger('info');

const MIN_PASSWORD_LENGTH = 12;

/** Reads one line from a terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('No terminal available. Pipe the password on stdin instead.'));
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const finish = (result: string): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish(value);
          return;
        }
        if (char === '\u0003') {
          // Ctrl-C
          process.stdout.write('\n');
          process.exit(1);
        }
        if (char === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

/** Non-interactive fallback: the whole of stdin is the password. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readStdin();

  const first = await promptHidden('Administrator password: ');
  const second = await promptHidden('Confirm password: ');

  if (first !== second) {
    process.stderr.write('Passwords did not match. Nothing was changed.\n');
    process.exit(1);
  }

  return first;
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.nodeEnv === 'production' && !process.argv.includes('--force')) {
    process.stderr.write(
      'Refusing to run with NODE_ENV=production. Pass --force if you genuinely mean it.\n',
    );
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (email === '') {
    process.stderr.write('Set ADMIN_EMAIL to the administrator address.\n');
    process.exit(1);
  }

  const password = await readPassword();

  if (password.length < MIN_PASSWORD_LENGTH) {
    process.stderr.write(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.\n`,
    );
    process.exit(1);
  }

  await connectDatabase(config.mongoUri, config.mongoDbName);

  const hashed = await hashPassword(password);
  const now = new Date();

  const existing = await Admin.findOne({ email });

  if (existing) {
    existing.passwordHash = hashed.hash;
    existing.passwordAlgo = hashed.algo;
    existing.passwordParams = hashed.params;
    existing.passwordUpdatedAt = now;
    existing.failedLoginCount = 0;
    existing.lockedUntil = null;
    await existing.save();

    // A password change invalidates every existing session.
    const removed = await Session.deleteMany({ adminId: existing._id });
    logger.info('admin_password_rotated', {
      email,
      sessionsRevoked: removed.deletedCount ?? 0,
    });
  } else {
    await Admin.create({
      email,
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      passwordParams: hashed.params,
      passwordUpdatedAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
    });
    logger.info('admin_created', { email });
  }

  // Never log the password, the hash, or the parameters.
  logger.info('provision_complete', { email });
  await disconnectDatabase();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Provisioning failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

/**
 * Database connection and health probe.
 *
 * Mongoose is used rather than the raw driver because it is the approved ODM
 * and arrives in S02 regardless; using it now avoids writing a throwaway
 * connection layer.
 */

import mongoose from 'mongoose';

export async function connectDatabase(uri: string, dbName: string): Promise<void> {
  await mongoose.connect(uri, {
    dbName,
    // Fail fast rather than buffering commands for 30 seconds when the database
    // is unreachable. A parent waiting on a form should get an answer quickly.
    serverSelectionTimeoutMS: 5000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * True only when a ping actually round-trips.
 *
 * Deliberately does not return the ready state alone: a connection can be
 * "connected" while the server is unreachable. The health endpoint reports what
 * the database says, not what Mongoose last believed.
 */
export async function pingDatabase(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;

  const db = mongoose.connection.db;
  if (!db) return false;

  try {
    await db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

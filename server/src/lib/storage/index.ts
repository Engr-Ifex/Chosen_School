/**
 * Storage factory — the one place the driver is chosen (ROADMAP S13).
 *
 * Every caller uses `getStorage()` and never learns which driver it got. The
 * server calls `configureStorage()` once at boot with the validated config;
 * tests that never configure it get the local driver, which writes under
 * `STORAGE_DIR` and touches no network.
 *
 * `getStorage()` is the **private** bucket: admission photographs. The public
 * gallery bucket arrives with S17, and must not share this accessor, so the
 * two can never be confused by a caller.
 */

import type { StorageConfig } from './config.js';
import { createLocalDriver } from './local.js';
import { createSupabaseDriver } from './supabase.js';
import type { StorageDriver } from './types.js';

let driver: StorageDriver | null = null;
let driverName: StorageConfig['driver'] = 'local';

export function configureStorage(config: StorageConfig): void {
  driverName = config.driver;
  driver =
    config.driver === 'supabase'
      ? createSupabaseDriver({ url: config.url, serviceKey: config.serviceKey, bucket: config.privateBucket })
      : createLocalDriver();
}

export function getStorage(): StorageDriver {
  driver ??= createLocalDriver();
  return driver;
}

/** For the startup log: which driver is in use. Never the key. */
export function storageDriverName(): StorageConfig['driver'] {
  return driverName;
}

export type { StorageDriver, StoredObject } from './types.js';

/**
 * Storage factory — the one place S13 changes.
 *
 * Today there is one driver. When Supabase Storage is provisioned, a second
 * driver is added here and selected by configuration; every caller keeps using
 * `getStorage()` and never learns which one it got.
 */

import { createLocalDriver } from './local.js';
import type { StorageDriver } from './types.js';

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  driver ??= createLocalDriver();
  return driver;
}

export type { StorageDriver, StoredObject } from './types.js';

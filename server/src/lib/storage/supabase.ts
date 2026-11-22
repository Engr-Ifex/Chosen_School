/**
 * Supabase Storage driver — ROADMAP S13, ADR-032.
 *
 * Talks to the Storage REST API with Node's built-in `fetch`. Not the
 * `@supabase/supabase-js` client the roadmap named: this driver makes three
 * calls (upload, authenticated download, delete), and the client would pull in
 * auth, realtime and database libraries that ADR-032 explicitly does not adopt.
 * AGENTS.md §6 forbids a dependency the existing stack can replace.
 *
 * Rules carried over from the local driver and the S08 design:
 *  - **Never a public or signed URL for a private object.** Downloads use the
 *    authenticated endpoint with the secret key, and the bytes are streamed to
 *    the admin through the API route, which checks the session first.
 *  - **Keys are server-generated and validated** before they reach a URL, so a
 *    future caller passing something odd cannot address another bucket or path.
 *  - **Errors never carry the secret key or a response body.** Status and a
 *    short reason only; the caller decides what the client sees.
 */

import type { StorageDriver, StoredObject } from './types.js';

export interface SupabaseDriverOptions {
  /** `https://<project-ref>.supabase.co`, validated by `loadStorageConfig`. */
  url: string;
  serviceKey: string;
  bucket: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. A paused project or a slow network must not hang an upload forever. */
  timeoutMs?: number;
}

/** What a server-generated key may contain: `applications/<uuid>.webp` and similar. */
const SAFE_KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/;

function assertKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error('Invalid storage key');
}

/** Encodes each segment, keeping the `/` separators. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export class StorageRequestError extends Error {
  readonly status: number;
  constructor(operation: string, status: number) {
    super(`Supabase storage ${operation} failed (HTTP ${status})`);
    this.name = 'StorageRequestError';
    this.status = status;
  }
}

/**
 * Supabase reports a missing object as `404`, or on some versions as `400`
 * with `"statusCode":"404"` / `"error":"not_found"` in the body.
 */
async function isNotFound(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = (await response.json()) as { statusCode?: unknown; error?: unknown };
    return String(body.statusCode) === '404' || body.error === 'not_found' || body.error === 'Not found';
  } catch {
    return false;
  }
}

export function createSupabaseDriver(options: SupabaseDriverOptions): StorageDriver {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const base = `${options.url}/storage/v1/object`;
  const bucket = encodeURIComponent(options.bucket);

  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: options.serviceKey,
    Authorization: `Bearer ${options.serviceKey}`,
    ...extra,
  });

  const call = (url: string, init: RequestInit) =>
    doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

  return {
    async put(key, data, contentType) {
      assertKey(key);
      const response = await call(`${base}/${bucket}/${encodeKey(key)}`, {
        method: 'POST',
        headers: headers({
          'Content-Type': contentType,
          // The interface overwrites silently; keys are UUIDs, so a real
          // collision would be a bug elsewhere, not a reason to fail here.
          'x-upsert': 'true',
          // Private objects are only ever served through the API, which sets
          // its own no-store header; this keeps Supabase's CDN from caching too.
          'cache-control': 'no-store',
        }),
        body: new Uint8Array(data),
      });
      if (!response.ok) throw new StorageRequestError('upload', response.status);
    },

    async get(key): Promise<StoredObject | null> {
      assertKey(key);
      const response = await call(`${base}/authenticated/${bucket}/${encodeKey(key)}`, {
        method: 'GET',
        headers: headers(),
      });
      if (response.ok) {
        return {
          data: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        };
      }
      if (await isNotFound(response)) return null;
      throw new StorageRequestError('download', response.status);
    },

    async remove(key) {
      assertKey(key);
      // Supabase deletes by prefix list; a key that does not exist is simply
      // absent from the result, which matches "missing keys are not an error".
      const response = await call(`${base}/${bucket}`, {
        method: 'DELETE',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: [key] }),
      });
      if (!response.ok && !(await isNotFound(response))) {
        throw new StorageRequestError('delete', response.status);
      }
    },
  };
}

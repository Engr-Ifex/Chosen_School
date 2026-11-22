/**
 * Supabase driver — request shape and error handling, with a fake `fetch`.
 *
 * What this proves: the driver calls the right endpoints with the right
 * headers, uses the **authenticated** download (never a public URL), treats a
 * missing object as `null`, and never puts the key in an error. That the real
 * buckets behave as configured is a separate, live check (INTEGRATIONS V-03,
 * V-04), because a fake cannot tell you a private bucket is really private.
 */

import { describe, expect, it, vi } from 'vitest';
import { createSupabaseDriver, StorageRequestError } from './supabase.js';

const KEY = 'sb_secret_TEST_PLACEHOLDER_NOT_REAL';
const URL_BASE = 'https://exampleref.supabase.co';

function setup(response: Response | (() => Response)) {
  const fetchImpl = vi.fn(async () => (typeof response === 'function' ? response() : response));
  const driver = createSupabaseDriver({
    url: URL_BASE,
    serviceKey: KEY,
    bucket: 'admissions-private',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const call = (index = 0) => {
    const [url, init] = fetchImpl.mock.calls[index] as unknown as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  };
  return { driver, fetchImpl, call };
}

const objectKey = 'applications/123e4567-e89b-12d3-a456-426614174000.webp';

describe('createSupabaseDriver', () => {
  it('uploads to the private bucket with the secret key and the content type', async () => {
    const { driver, call } = setup(new Response('{}', { status: 200 }));
    await driver.put(objectKey, Buffer.from('image-bytes'), 'image/webp');

    const { url, init, headers } = call();
    expect(url).toBe(`${URL_BASE}/storage/v1/object/admissions-private/${objectKey}`);
    expect(init.method).toBe('POST');
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers.apikey).toBe(KEY);
    expect(headers['Content-Type']).toBe('image/webp');
    expect(headers['x-upsert']).toBe('true');
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe('image-bytes');
  });

  it('downloads through the authenticated endpoint, never a public URL', async () => {
    const { driver, call } = setup(
      new Response(Buffer.from('webp'), { status: 200, headers: { 'content-type': 'image/webp' } }),
    );
    const object = await driver.get(objectKey);

    expect(call().url).toBe(`${URL_BASE}/storage/v1/object/authenticated/admissions-private/${objectKey}`);
    expect(call().url).not.toContain('/public/');
    expect(call().url).not.toContain('/sign/');
    expect(object?.data.toString()).toBe('webp');
    expect(object?.contentType).toBe('image/webp');
  });

  it('returns null for a missing object (404)', async () => {
    const { driver } = setup(new Response('{}', { status: 404 }));
    expect(await driver.get(objectKey)).toBeNull();
  });

  it('returns null for a missing object reported as 400 not_found', async () => {
    const { driver } = setup(
      new Response(JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }), {
        status: 400,
      }),
    );
    expect(await driver.get(objectKey)).toBeNull();
  });

  it('throws on other failures, without the key in the message', async () => {
    const { driver } = setup(() => new Response('{}', { status: 403 }));

    const error = await driver.get(objectKey).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageRequestError);
    expect((error as StorageRequestError).status).toBe(403);
    expect(String((error as Error).message)).not.toContain(KEY);

    await expect(driver.put(objectKey, Buffer.from('x'), 'image/webp')).rejects.toBeInstanceOf(StorageRequestError);
  });

  it('deletes by prefix list, and a missing object is not an error', async () => {
    const { driver, call } = setup(new Response('[]', { status: 200 }));
    await driver.remove(objectKey);

    const { url, init } = call();
    expect(url).toBe(`${URL_BASE}/storage/v1/object/admissions-private`);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ prefixes: [objectKey] });
  });

  it.each(['../secret.webp', '/absolute.webp', 'applications/../../x.webp', 'a b.webp', 'noextension', ''])(
    'refuses the key %j before making any request',
    async (badKey) => {
      const { driver, fetchImpl } = setup(new Response('{}', { status: 200 }));
      await expect(driver.get(badKey)).rejects.toThrow('Invalid storage key');
      await expect(driver.put(badKey, Buffer.from('x'), 'image/webp')).rejects.toThrow('Invalid storage key');
      await expect(driver.remove(badKey)).rejects.toThrow('Invalid storage key');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

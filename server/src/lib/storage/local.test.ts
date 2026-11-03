import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The local driver. Runs against a temporary directory so nothing touches the
 * project, and sets `STORAGE_DIR` before importing — the root is resolved once
 * at module load.
 */
const root = await mkdtemp(join(tmpdir(), 'chosen-storage-'));
process.env.STORAGE_DIR = root;

const { createLocalDriver } = await import('./local.js');

const driver = createLocalDriver();

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('local storage driver', () => {
  it('stores and returns an object', async () => {
    const data = Buffer.from('hello photo');

    await driver.put('applications/one.webp', data, 'image/webp');
    const stored = await driver.get('applications/one.webp');

    expect(stored).not.toBeNull();
    expect(stored?.data.equals(data)).toBe(true);
    expect(stored?.contentType).toBe('image/webp');
  });

  it('writes the bytes to disk under the storage root', async () => {
    await driver.put('applications/two.webp', Buffer.from('abc'), 'image/webp');
    const onDisk = await readFile(join(root, 'applications/two.webp'));
    expect(onDisk.toString()).toBe('abc');
  });

  it('returns null for a missing key rather than throwing', async () => {
    await expect(driver.get('applications/absent.webp')).resolves.toBeNull();
  });

  it('treats removing a missing key as success', async () => {
    await expect(driver.remove('applications/absent.webp')).resolves.toBeUndefined();
  });

  it('removes a stored object', async () => {
    await driver.put('applications/three.webp', Buffer.from('x'), 'image/webp');
    await driver.remove('applications/three.webp');

    await expect(driver.get('applications/three.webp')).resolves.toBeNull();
  });

  it('creates nested directories for a key', async () => {
    await driver.put('a/b/c/four.webp', Buffer.from('deep'), 'image/webp');
    const stored = await driver.get('a/b/c/four.webp');
    expect(stored?.data.toString()).toBe('deep');
  });

  it('rejects a traversal key instead of escaping the root', async () => {
    // Keys are server-generated UUIDs, so this cannot happen today. The check
    // exists because the consequence — writing outside the storage root — is
    // severe enough that it should not depend on that staying true.
    await expect(driver.put('../escaped.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(
      /Invalid storage key/,
    );
    await expect(driver.get('../../.env')).rejects.toThrow(/Invalid storage key/);
  });

  it('rejects an empty key', async () => {
    await expect(driver.get('')).rejects.toThrow(/Invalid storage key/);
  });

  it('rejects a key containing a null byte', async () => {
    await expect(driver.get('applications/one.webp\0.png')).rejects.toThrow(/Invalid storage key/);
  });
});

describe('storage factory', () => {
  it('returns the same driver instance each time', async () => {
    const { getStorage } = await import('./index.js');
    expect(getStorage()).toBe(getStorage());
  });
});

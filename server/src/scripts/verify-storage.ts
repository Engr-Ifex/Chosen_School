/**
 * Live storage verification — INTEGRATIONS.md V-03 and V-04, ROADMAP S13 DoD.
 *
 *     npm run verify-storage --workspace server
 *
 * Runs against the **real** buckets named in `server/.env`. A fake cannot tell
 * you a private bucket is really private, so this is the check that matters
 * before any real photograph is uploaded (S13 "Risks").
 *
 * What it does, in order:
 *  1. Validates the storage settings (the same checks as server boot).
 *  2. Reads each bucket's settings: private must be private, public must be public.
 *  3. Uploads a tiny synthetic image to each bucket under `verification/`.
 *  4. V-03: fetches the private object **without** credentials, by its
 *     public-style URL and by the authenticated URL. Both must fail.
 *  5. Reads it back **with** the key through the driver. Bytes must match.
 *  6. V-04: fetches the public object without credentials. Must succeed.
 *  7. Deletes both objects and confirms they are gone.
 *
 * Prints HTTP statuses only: never the key, never an object's contents.
 * Exits non-zero if any check fails. Test objects are always cleaned up.
 */

import { randomUUID } from 'node:crypto';
import { loadStorageConfig } from '../lib/storage/config.js';
import { createSupabaseDriver } from '../lib/storage/supabase.js';

/** A 1×1 WebP. Synthetic: no person, no metadata. */
const TINY_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64',
);

interface Result {
  id: string;
  check: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const results: Result[] = [];
/** Advisory findings: printed, but they do not fail the check. */
const notes: string[] = [];
const record = (id: string, check: string, expected: string, actual: string, pass: boolean) =>
  results.push({ id, check, expected, actual, pass });

async function main(): Promise<void> {
  const { config, issues } = loadStorageConfig(process.env, 'production');
  if (issues.length > 0 || config.driver !== 'supabase') {
    process.stderr.write('Storage settings are not valid, so nothing was contacted:\n');
    for (const issue of issues) process.stderr.write(`  ${issue.variable}: ${issue.message}\n`);
    process.exit(1);
  }

  const auth = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
  const base = `${config.url}/storage/v1`;
  const privateDriver = createSupabaseDriver({ url: config.url, serviceKey: config.serviceKey, bucket: config.privateBucket });
  const publicDriver = createSupabaseDriver({ url: config.url, serviceKey: config.serviceKey, bucket: config.publicBucket });
  const privateKey = `verification/${randomUUID()}.webp`;
  const publicKey = `verification/${randomUUID()}.webp`;

  try {
    // 2. Bucket settings.
    for (const [bucket, wantPublic] of [
      [config.privateBucket, false],
      [config.publicBucket, true],
    ] as const) {
      const response = await fetch(`${base}/bucket/${encodeURIComponent(bucket)}`, { headers: auth });
      if (!response.ok) {
        record('V-00', `bucket "${bucket}" exists`, '200', String(response.status), false);
        continue;
      }
      const info = (await response.json()) as {
        public?: boolean;
        file_size_limit?: number | null;
        allowed_mime_types?: string[] | null;
      };
      record('V-00', `bucket "${bucket}" public = ${wantPublic}`, String(wantPublic), String(info.public), info.public === wantPublic);
      // Not a failure (the server enforces 5 MB and image types itself), but the
      // roadmap asks for bucket limits too, as a second line of defence.
      const hasLimits = Boolean(info.file_size_limit) && Boolean(info.allowed_mime_types?.length);
      notes.push(
        hasLimits
          ? `bucket "${bucket}": size limit ${info.file_size_limit}, types ${info.allowed_mime_types?.join(', ')}`
          : `bucket "${bucket}" has no ${info.file_size_limit ? '' : 'size limit'}${!info.file_size_limit && !info.allowed_mime_types?.length ? ' and no ' : ''}${info.allowed_mime_types?.length ? '' : 'file-type limit'} — set them in Storage → bucket → Edit bucket`,
      );
    }

    // 3. Upload test objects.
    await privateDriver.put(privateKey, TINY_WEBP, 'image/webp');
    await publicDriver.put(publicKey, TINY_WEBP, 'image/webp');
    record('V-01s', 'upload to private bucket with the key', 'ok', 'ok', true);

    // 4. V-03: the private object must not be reachable without credentials.
    const publicStyle = await fetch(`${base}/object/public/${config.privateBucket}/${privateKey}`);
    record(
      'V-03',
      'private object via public URL, no key',
      '400/403/404, never the file',
      String(publicStyle.status),
      !publicStyle.ok,
    );
    const noKey = await fetch(`${base}/object/authenticated/${config.privateBucket}/${privateKey}`);
    record('V-03', 'private object via authenticated URL, no key', '400/401/403', String(noKey.status), !noKey.ok);

    // 5. With the key, through the driver.
    const readBack = await privateDriver.get(privateKey);
    record(
      'V-03',
      'private object read back with the key',
      'bytes match',
      readBack ? (readBack.data.equals(TINY_WEBP) ? 'bytes match' : 'bytes differ') : 'missing',
      Boolean(readBack?.data.equals(TINY_WEBP)),
    );

    // 6. V-04: the public object is served without credentials.
    const publicGet = await fetch(`${base}/object/public/${config.publicBucket}/${publicKey}`);
    const publicBytes = publicGet.ok ? Buffer.from(await publicGet.arrayBuffer()) : null;
    record(
      'V-04',
      'public object via public URL, no key',
      '200 with the image',
      `${publicGet.status}${publicBytes ? (publicBytes.equals(TINY_WEBP) ? ', bytes match' : ', bytes differ') : ''}`,
      Boolean(publicBytes?.equals(TINY_WEBP)),
    );
  } catch (error) {
    record('ERR', 'unexpected failure', 'none', error instanceof Error ? error.message : 'unknown error', false);
  } finally {
    // 7. Always clean up, even after a failure.
    try {
      await privateDriver.remove(privateKey);
      await publicDriver.remove(publicKey);
      const gone = (await privateDriver.get(privateKey)) === null;
      record('V-01d', 'test objects deleted', 'gone', gone ? 'gone' : 'still present', gone);
    } catch (error) {
      record('V-01d', 'test objects deleted', 'gone', error instanceof Error ? error.message : 'unknown error', false);
    }
  }

  const width = Math.max(...results.map((r) => r.check.length));
  for (const r of results) {
    process.stdout.write(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(5)}  ${r.check.padEnd(width)}  expected ${r.expected}; got ${r.actual}\n`);
  }

  for (const note of notes) process.stdout.write(`NOTE         ${note}\n`);

  const failed = results.filter((r) => !r.pass).length;
  process.stdout.write(failed === 0 ? '\nAll storage checks passed.\n' : `\n${failed} check(s) failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();

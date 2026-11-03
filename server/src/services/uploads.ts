/**
 * Photo validation and re-encoding — docs/SECURITY.md §7, TEST_PLAN F-01 to F-09.
 *
 * **Nothing from the client is trusted.** The declared MIME type and the filename
 * are ignored entirely: type is decided by magic bytes, and the output is a new
 * file built by `sharp` from decoded pixels. That single decision defeats the
 * whole class of polyglot attacks — a file that is a valid JPEG *and* a valid
 * ZIP is reduced to the pixels it decodes to, and the appended archive is gone.
 *
 * Re-encoding also removes EXIF and GPS, because `sharp` writes metadata only
 * when asked. Verified against a JPEG carrying a real GPS block: the output has
 * no EXIF and the GPS strings do not appear anywhere in the bytes.
 */

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../errors.js';

/** 5 MB. Enforced twice: at the multipart parser and again here. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Longest edge of the stored image. A 8000 px upload becomes 1600 px. */
export const MAX_EDGE = 1600;

export interface ProcessedPhoto {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
  contentType: 'image/webp';
}

/**
 * Identifies the image type from its first bytes.
 *
 * Returns `null` for anything that is not JPEG, PNG or WebP — which covers SVG,
 * GIF, PDF, ZIP and every polyglot that does not begin with a raster signature.
 */
export function sniffImage(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }

  const riff = buffer.subarray(0, 4).toString('latin1');
  const webp = buffer.subarray(8, 12).toString('latin1');
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp';

  const head = buffer.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';

  return null;
}

/**
 * Validates and re-encodes an uploaded photo.
 *
 * @throws AppError 413 when too large, 415 when the type is not allowed.
 */
export async function processPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
  if (buffer.length === 0) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'The photo was empty.');
  }

  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'The photo must be 5 MB or smaller.');
  }

  const kind = sniffImage(buffer);

  if (kind === null) {
    // Covers SVG, which has no raster signature — and an SVG is a script
    // container, not a picture.
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      'The photo must be a JPEG, PNG or WebP image.',
    );
  }

  if (kind === 'gif') {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Animated images are not accepted. Please upload a still photo.',
    );
  }

  try {
    const pipeline = sharp(buffer, { failOn: 'error' });

    const metadata = await pipeline.metadata();

    // An animated WebP is a WebP by magic bytes; `pages` is what reveals it.
    if ((metadata.pages ?? 1) > 1) {
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Animated images are not accepted. Please upload a still photo.',
      );
    }

    const { data, info } = await pipeline
      // Applies the EXIF orientation before the tag is discarded, so a rotated
      // phone photo is stored upright rather than sideways.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width,
      height: info.height,
      bytes: data.length,
      contentType: 'image/webp',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // A file that passed the magic-byte check but will not decode is corrupt.
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'That image could not be read.');
  }
}

/**
 * The storage key for a new photo.
 *
 * A UUID, never the uploaded filename: `../../etc/passwd.jpg` must not influence
 * where anything is written (F-08), and two uploads of `photo.jpg` must not
 * collide (F-09).
 */
export function newPhotoKey(): string {
  return `applications/${randomUUID()}.webp`;
}

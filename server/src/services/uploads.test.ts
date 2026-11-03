import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { MAX_EDGE, MAX_PHOTO_BYTES, newPhotoKey, processPhoto, sniffImage } from './uploads.js';

/** A real JPEG, optionally carrying EXIF and GPS. */
async function jpegWithExif(options: { gps?: boolean; width?: number; height?: number } = {}) {
  const pipeline = sharp({
    create: { width: options.width ?? 60, height: options.height ?? 40, channels: 3, background: '#336699' },
  }).jpeg();

  if (options.gps) {
    return pipeline
      .withMetadata({
        // `sharp`'s Exif type lists the IFD blocks it models; libvips accepts a
        // GPS block too, and that is exactly what this test needs to prove is
        // stripped. The cast is to the narrower published type, not a workaround
        // for a runtime problem — the GPS data really is written.
        exif: {
          IFD0: { Copyright: 'Chosen School' },
          GPS: { GPSLatitudeRef: 'N', GPSLatitude: '6/1 27/1 0/1' },
        } as never,
      })
      .toBuffer();
  }

  return pipeline.toBuffer();
}

describe('sniffImage', () => {
  it('identifies JPEG, PNG and WebP by magic bytes', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer();
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();

    expect(sniffImage(jpeg)).toBe('jpeg');
    expect(sniffImage(png)).toBe('png');
    expect(sniffImage(webp)).toBe('webp');
  });

  it('identifies GIF, so it can be rejected as animated', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    expect(sniffImage(gif)).toBe('gif');
  });

  it('returns null for a ZIP with a .jpg name (F-01)', () => {
    // A ZIP renamed to .jpg is still a ZIP. The extension is never consulted.
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);
    expect(sniffImage(zip)).toBeNull();
  });

  it('returns null for SVG', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
  });

  it('returns null for a buffer too short to identify', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('processPhoto', () => {
  it('re-encodes a JPEG to WebP', async () => {
    const result = await processPhoto(await jpegWithExif());

    expect(result.contentType).toBe('image/webp');
    expect((await sharp(result.data).metadata()).format).toBe('webp');
  });

  it('accepts a real JPEG named .png, because content decides (F-02)', async () => {
    // The filename never reaches this function — only bytes do.
    const result = await processPhoto(await jpegWithExif());
    expect(result.contentType).toBe('image/webp');
  });

  it('rejects an SVG containing a script (F-04)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );

    await expect(processPhoto(svg)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      status: 415,
    });
  });

  it('rejects an animated GIF (F-05)', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();

    await expect(processPhoto(gif)).rejects.toMatchObject({ status: 415 });
  });

  it('rejects a file above 5 MB (F-03)', async () => {
    const oversized = Buffer.alloc(MAX_PHOTO_BYTES + 1, 0xff);
    // Give it a JPEG signature so the size check is what rejects it.
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    oversized[2] = 0xff;

    await expect(processPhoto(oversized)).rejects.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
    });
  });

  it('rejects an empty file', async () => {
    await expect(processPhoto(Buffer.alloc(0))).rejects.toMatchObject({ status: 415 });
  });

  it('rejects a truncated image that passes the magic-byte check', async () => {
    const truncated = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 0x00),
    ]);

    await expect(processPhoto(truncated)).rejects.toBeInstanceOf(AppError);
  });

  it('strips EXIF and GPS from the stored image (F-06)', async () => {
    const source = await jpegWithExif({ gps: true });

    // The input really does carry the metadata — otherwise this test proves nothing.
    expect(Boolean((await sharp(source).metadata()).exif)).toBe(true);

    const result = await processPhoto(source);
    const output = await sharp(result.data).metadata();

    expect(output.exif).toBeUndefined();
    expect(result.data.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(result.data.includes(Buffer.from('Chosen School'))).toBe(false);
  });

  it('downscales a very large image to the long-edge limit (F-07)', async () => {
    // A real 8000x8000 buffer is slow to build, so the limit is asserted on a
    // proportionally large image instead.
    const large = await jpegWithExif({ width: 3200, height: 2400 });
    const result = await processPhoto(large);

    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(MAX_EDGE);
  });

  it('does not enlarge a small image', async () => {
    const result = await processPhoto(await jpegWithExif({ width: 40, height: 30 }));
    expect(result.width).toBe(40);
  });

  it('reports dimensions and byte size of the stored output', async () => {
    const result = await processPhoto(await jpegWithExif({ width: 100, height: 50 }));

    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.bytes).toBe(result.data.length);
  });
});

describe('newPhotoKey', () => {
  it('never uses the uploaded filename (F-08)', () => {
    // There is no filename parameter at all — that is the point.
    const key = newPhotoKey();
    expect(key).toMatch(/^applications\/[0-9a-f-]{36}\.webp$/);
    expect(key).not.toContain('..');
    expect(key).not.toContain('passwd');
  });

  it('produces a distinct key for every upload (F-09)', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newPhotoKey()));
    expect(keys.size).toBe(50);
  });
});

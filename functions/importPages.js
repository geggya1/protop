/**
 * Ferdige JPEG-sider i en lett PDF sendes rett til modellen.
 * Da slipper funksjonen å starte Tesseract, som kan velte hele kallet.
 */
import { extractEmbeddedJpegs } from '../src/imports/filePayload.js';
import { jpegWithinLimit } from './imageLimit.js';

export function pagePartsFromPdf(buffer, maxImages = 6) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const limit = Math.max(1, Math.min(8, Number(maxImages) || 6));
  return extractEmbeddedJpegs(raw, { minBytes: 8_000, maxCount: limit })
    .filter((bytes) => jpegWithinLimit(bytes))
    .map((bytes) => ({
      inline_data: {
        mime_type: 'image/jpeg',
        data: Buffer.from(bytes).toString('base64'),
      },
    }));
}

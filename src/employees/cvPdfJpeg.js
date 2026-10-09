/** JPEG-hjelpere for CV-PDF — uten Firebase-import (Node-tester). */
import { decodeBase64, jpegSize } from '../project/companyLogo.js';

export function jpegFromBytes(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const size = jpegSize(buf) || { width: 800, height: 600 };
    return {
      bytes: buf instanceof Uint8Array ? buf : new Uint8Array(buf),
      width: size.width,
      height: size.height,
    };
  }
  return null;
}

export function jpegFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return jpegFromBytes(decodeBase64(match[1]));
}

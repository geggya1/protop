/** Store JPEG-sider hoppes over, så OCR ikke sprenger minnet. */
export const MAX_OCR_IMAGE_BYTES = 1_800_000;

export function jpegWithinLimit(bytes) {
  const length = bytes?.length || 0;
  if (!length || length > MAX_OCR_IMAGE_BYTES) return false;
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

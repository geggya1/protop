/** Normaliser EAN/GTIN-strekkode til ren sifferstreng. */
export function normalizeBarcode(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12) return `0${digits}`;
  if (digits.length === 13 || digits.length === 8) return digits;
  if (digits.length > 13) return digits.slice(-13);
  return digits;
}

export function isValidBarcode(raw) {
  const code = normalizeBarcode(raw);
  return code.length === 8 || code.length === 13;
}

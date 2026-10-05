/** Bedriftens egen logo. ProTop-logoen i appen ligger utenfor dette. */

export const COMPANY_LOGO_MAX = 220000;

function text(value) {
  return String(value || '').trim();
}

export function normalizeCompanyLogo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dataUrl = text(raw.dataUrl).replace(/\s/g, '');
  if (!/^data:image\/(?:jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return null;
  if (dataUrl.length > COMPANY_LOGO_MAX) return null;
  const width = Math.round(Number(raw.width) || 0);
  const height = Math.round(Number(raw.height) || 0);
  return {
    dataUrl,
    width: width > 0 && width <= 4000 ? width : 0,
    height: height > 0 && height <= 4000 ? height : 0,
    updatedAt: text(raw.updatedAt).slice(0, 40),
  };
}

export function companyLogoOf(company) {
  return normalizeCompanyLogo(company?.logo);
}

/** Bevarer logo og egne felt når offentlige opplysninger hentes på nytt. */
export function mergeCompanyProfile(next, previous) {
  if (!next) return next;
  const logo = companyLogoOf(previous);
  return {
    ...next,
    telefon: text(next.telefon) || text(previous?.telefon),
    epostadresse: text(next.epostadresse) || text(previous?.epostadresse),
    egneNaeringskoder: Array.isArray(previous?.egneNaeringskoder) ? previous.egneNaeringskoder : [],
    subUnits: Array.isArray(previous?.subUnits) ? previous.subUnits : [],
    ...(logo ? { logo } : {}),
  };
}

export function decodeBase64(value) {
  const clean = text(value).replace(/\s/g, '');
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) return null;
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(clean, 'base64'));
  if (typeof atob !== 'function') return null;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (!width || !height) return null;
      return { width, height };
    }
    i += 2 + length;
  }
  return null;
}

export function logoForDocument(raw) {
  const clean = normalizeCompanyLogo(raw);
  if (!clean) return null;
  const payload = clean.dataUrl.slice(clean.dataUrl.indexOf(',') + 1);
  const bytes = decodeBase64(payload);
  const size = jpegSize(bytes);
  if (!bytes || !size) return null;
  return {
    dataUrl: clean.dataUrl,
    width: clean.width || size.width,
    height: clean.height || size.height,
    bytes,
  };
}

export function presentCompanyLogo(raw) {
  const file = logoForDocument(raw);
  if (!file) return null;
  return {
    dataUrl: file.dataUrl,
    width: file.width,
    height: file.height,
    updatedAt: normalizeCompanyLogo(raw)?.updatedAt || '',
  };
}

export function fitLogoBox(width, height, maxWidth = 160, maxHeight = 56) {
  const w = Number(width) > 0 ? Number(width) : maxWidth;
  const h = Number(height) > 0 ? Number(height) : maxHeight;
  const scale = Math.min(maxWidth / w, maxHeight / h);
  return {
    width: Math.max(1, w * scale),
    height: Math.max(1, h * scale),
  };
}

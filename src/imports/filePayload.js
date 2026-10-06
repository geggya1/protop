/**
 * Gjør store CV- og importfiler små nok til kallet som leser dem.
 * Hele filen som base64 ryker med feilen «internal» når den er for stor,
 * og funksjonen som allerede kjører, tar imot høyst én dokumentstreng.
 * Skannede sider trekkes ut, forminskes og pakkes i en ny, lettere PDF.
 */

const MAX_BASE64_CHARS = 5_500_000;
const MAX_SOURCE_BYTES = 40_000_000;
const MAX_PAGES = 12;
const MIN_EMBEDDED_BYTES = 20_000;

function ascii(value) {
  return Uint8Array.from(String(value), (char) => char.charCodeAt(0));
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToBase64(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < raw.length; index += chunk) {
    binary += String.fromCharCode(...raw.subarray(index, index + chunk));
  }
  if (typeof btoa !== 'function') throw new Error('Kunne ikke sende filen til tolking.');
  return btoa(binary);
}

export function base64Length(byteLength) {
  return Math.ceil(Number(byteLength || 0) / 3) * 4;
}

function fits(bytes) {
  return base64Length(bytes?.length || 0) <= MAX_BASE64_CHARS;
}

function jpegEnd(raw, start) {
  let index = start + 2;
  while (index < raw.length - 1) {
    if (raw[index] !== 0xff) {
      index += 1;
      continue;
    }
    while (index < raw.length && raw[index] === 0xff) index += 1;
    if (index >= raw.length) return -1;
    const marker = raw[index];
    index += 1;
    if (marker === 0xd9) return index;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (index + 1 >= raw.length) return -1;
    const length = (raw[index] << 8) | raw[index + 1];
    if (length < 2) return -1;
    if (marker === 0xda) {
      index += length;
      while (index < raw.length - 1) {
        if (raw[index] !== 0xff) {
          index += 1;
          continue;
        }
        const next = raw[index + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          index += 2;
          continue;
        }
        if (next === 0xd9) return index + 2;
        return -1;
      }
      return -1;
    }
    index += length;
  }
  return -1;
}

export function extractEmbeddedJpegs(bytes, { minBytes = MIN_EMBEDDED_BYTES, maxCount = MAX_PAGES } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const found = [];
  let index = 0;
  while (index < raw.length - 3 && found.length < maxCount) {
    if (raw[index] === 0xff && raw[index + 1] === 0xd8 && raw[index + 2] === 0xff) {
      const end = jpegEnd(raw, index);
      if (end > index) {
        if (end - index >= minBytes) found.push(raw.slice(index, end));
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return found;
}

export function jpegSize(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let index = 2;
  while (index < raw.length - 8) {
    if (raw[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = raw[index + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: (raw[index + 5] << 8) | raw[index + 6],
        width: (raw[index + 7] << 8) | raw[index + 8],
      };
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    const length = (raw[index + 2] << 8) | raw[index + 3];
    if (length < 2) break;
    index += 2 + length;
  }
  return null;
}

export function pdfFromJpegs(images) {
  const pages = (images || []).filter((image) => image?.bytes?.length && image.width > 0 && image.height > 0);
  if (!pages.length) return null;
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    parts.push(part);
    length += part.length;
  };
  const pushText = (value) => push(ascii(value));
  pushText('%PDF-1.4\n');
  const ids = pages.map((_, index) => ({
    page: 3 + index * 3,
    content: 4 + index * 3,
    image: 5 + index * 3,
  }));
  const pushObj = (id, body) => {
    offsets[id] = length;
    pushText(`${id} 0 obj\n${body}\nendobj\n`);
  };
  pushObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  pushObj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((id) => `${id.page} 0 R`).join(' ')}] >>`);
  pages.forEach((image, index) => {
    const id = ids[index];
    pushObj(id.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${id.image} 0 R >> >> /Contents ${id.content} 0 R >>`);
    const content = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
    pushObj(id.content, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[id.image] = length;
    pushText(`${id.image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    push(image.bytes);
    pushText('\nendstream\nendobj\n');
  });
  const xrefAt = length;
  const size = 2 + pages.length * 3;
  let xref = `xref\n0 ${size + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= size; id += 1) {
    xref += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer << /Size ${size + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  pushText(xref);
  return concat(parts);
}

function isPdf(filename, mime) {
  return String(filename || '').toLowerCase().endsWith('.pdf') || String(mime || '').toLowerCase() === 'application/pdf';
}

function isImage(filename, mime) {
  return /^image\//i.test(String(mime || '')) || /\.(png|jpe?g|webp)$/i.test(String(filename || ''));
}

async function shrunkPage(bytes, shrinkImage, options) {
  if (typeof shrinkImage !== 'function') return null;
  try {
    const shrunk = await shrinkImage(bytes, options);
    if (!shrunk?.bytes?.length || !(shrunk.width > 0) || !(shrunk.height > 0)) return null;
    return shrunk.bytes.length < bytes.length ? shrunk : { bytes, width: shrunk.width, height: shrunk.height };
  } catch {
    return null;
  }
}

const SHRINK_ATTEMPTS = [
  { maxEdge: 1400, quality: 0.72 },
  { maxEdge: 1000, quality: 0.58 },
  { maxEdge: 720, quality: 0.46 },
];

export async function prepareImportBody({ bytes, filename = '', mime = '' } = {}, { shrinkImage } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!raw.length) throw new Error('Kunne ikke lese filen.');
  if (raw.length > MAX_SOURCE_BYTES) {
    throw new Error('Filen er for stor. Lagre den som en mindre PDF, eller del den opp.');
  }
  const pdf = isPdf(filename, mime);
  const embedded = pdf ? extractEmbeddedJpegs(raw) : [];
  const heavy = !fits(raw) || raw.length > 3_500_000 || embedded.some((image) => image.length > 600_000);
  if (pdf && embedded.length && heavy) {
    let pages = [];
    for (const image of embedded) {
      const page = await shrunkPage(image, shrinkImage, SHRINK_ATTEMPTS[0]);
      if (page) pages.push(page);
    }
    for (let attempt = 0; attempt < SHRINK_ATTEMPTS.length && pages.length; attempt += 1) {
      if (attempt > 0) {
        const smaller = [];
        for (const page of pages) {
          const next = await shrunkPage(page.bytes, shrinkImage, SHRINK_ATTEMPTS[attempt]);
          smaller.push(next || page);
        }
        pages = smaller;
      }
      let packed = pdfFromJpegs(pages);
      while (packed && !fits(packed) && pages.length > 1) {
        pages.pop();
        packed = pdfFromJpegs(pages);
      }
      if (packed && fits(packed)) {
        return { mime: 'application/pdf', imageBase64: bytesToBase64(packed) };
      }
    }
  }
  let outgoing = raw;
  let outMime = mime || (pdf ? 'application/pdf' : 'image/jpeg');
  if (isImage(filename, mime) && !fits(raw)) {
    const page = await shrunkPage(raw, shrinkImage, SHRINK_ATTEMPTS[2]);
    if (page?.bytes && fits(page.bytes)) {
      outgoing = page.bytes;
      outMime = 'image/jpeg';
    }
  }
  if (!fits(outgoing)) {
    throw new Error('Filen er for stor til å sendes. Lagre PDF-en med lavere oppløsning, eller del den opp.');
  }
  return { mime: outMime, imageBase64: bytesToBase64(outgoing) };
}

export function readableImportError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  const blob = `${code} ${message}`;
  if (/not-found|unavailable/i.test(blob)) {
    return new Error('AI-tolking er ikke tilgjengelig akkurat nå.');
  }
  if (/deadline-exceeded|timeout/i.test(blob)) {
    return new Error('Lesingen tok for lang tid. Prøv en kortere PDF.');
  }
  if (/internal/i.test(code) || /^internal$/i.test(message)) {
    return new Error('Lesingen ble avbrutt. Stor fil kan være for tung. Prøv igjen, eller lagre PDF-en med lavere oppløsning.');
  }
  if (message) return err;
  return new Error('Kunne ikke lese filen.');
}

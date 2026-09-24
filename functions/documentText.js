import { inflateRawSync } from 'node:zlib';

const DOCX_XML = 'word/document.xml';

/**
 * Hent lesbar tekst fra PDF (norske skole-timeplaner er ofte tekstbaserte).
 * Bruker pdfjs legacy-build uten worker — egnet for Cloud Functions.
 */
export async function extractPdfText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 100) {
    throw new Error('PDF-filen er for liten eller tom.');
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const tokens = [];
  const positionedItems = [];
  const maxPages = Math.min(doc.numPages || 0, 8);
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    for (const item of content.items || []) {
      const str = String(item?.str || '').trim();
      if (str) {
        tokens.push(str);
        positionedItems.push({
          str,
          x: item.transform[4],
          y: item.transform[5],
          page: pageNo,
        });
      }
    }
    if (pageNo < maxPages) tokens.push('\n');
  }
  try {
    await doc.destroy?.();
  } catch {
    // ignore
  }
  const text = tokens.join(' ').replace(/[ \t]{2,}/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  if (!text || text.length < 8) {
    throw new Error('Fant ingen lesbar tekst i PDF-en. Prøv bilde eller skannet kopi.');
  }
  return { text, tokens, positionedItems };
}

function stripDocxXml(xml) {
  return String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^/]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Minimal ZIP local-file reader for docx (deflate / stored). */
export function extractDocxText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] === 0x50 && buf[offset + 1] === 0x4b && buf[offset + 2] === 0x01 && buf[offset + 3] === 0x02) {
      break;
    }
    if (!(buf[offset] === 0x50 && buf[offset + 1] === 0x4b && buf[offset + 2] === 0x03 && buf[offset + 3] === 0x04)) {
      offset += 1;
      continue;
    }
    const compression = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === DOCX_XML) {
      if (!compressedSize) {
        throw new Error('Kunne ikke lese Word-dokumentet. Lagre som PDF og prøv igjen.');
      }
      const data = buf.slice(dataStart, dataStart + compressedSize);
      let xml;
      if (compression === 0) xml = data.toString('utf8');
      else if (compression === 8) xml = inflateRawSync(data).toString('utf8');
      else throw new Error('Kunne ikke lese Word-dokumentet. Lagre som PDF og prøv igjen.');
      const text = stripDocxXml(xml);
      if (!text) throw new Error('Word-dokumentet ser tomt ut. Lagre som PDF og prøv igjen.');
      return text;
    }
    offset = dataStart + Math.max(compressedSize, 1);
  }
  throw new Error('Kunne ikke lese Word-dokumentet. Lagre som PDF og prøv igjen.');
}

export function decodePlainText(base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  return buf.toString('utf8').replace(/\u0000/g, '').trim();
}

export function classifyPlanMime(mimeType, fileName) {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime === 'text/plain' || mime === 'text/txt' || name.endsWith('.txt')) return 'text';
  if (
    mime.includes('wordprocessingml')
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || name.endsWith('.docx')
  ) return 'docx';
  if (mime === 'application/msword' || name.endsWith('.doc')) return 'doc';
  if (mime.startsWith('text/')) return 'text';
  return 'unknown';
}

export { stripDocxXml };

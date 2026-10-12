/** Leser offentlig konkurransetekst. Innloggede portalfiler blir stående som lenke. */
import { allowedDownloadUrl } from './anbud/portalCatalog.js';
import { extractPdfLines } from './documentText.js';

/** Samme tak som opplasting i tilbudet. Konkurransegrunnlag er ofte 5–20 MB. */
export const MAX_PUBLIC_READ_BYTES = 25 * 1024 * 1024;
const READ_TEXT_CHARS = 12000;
const READ_PDF_PAGES = 40;

function clip(value, max) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

export async function takeBody(response, maxBytes = MAX_PUBLIC_READ_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    try { await response.body?.cancel?.(); } catch { /* avbryt resten */ }
    return null;
  }
  if (!response.body?.getReader) {
    const buf = Buffer.from(await response.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* avbryt resten */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function textFromBuffer(buf, mimeType, url) {
  const mime = String(mimeType || '');
  const href = String(url || '').toLowerCase();
  if (/pdf/i.test(mime) || href.endsWith('.pdf')) {
    return extractPdfLines(buf, { maxPages: READ_PDF_PAGES, maxChars: READ_TEXT_CHARS });
  }
  if (/text|json|xml/i.test(mime) && !/html/i.test(mime)) return buf.toString('utf8');
  return '';
}

export async function readPublicDocuments({ urls = [] } = {}) {
  const excerpts = [];
  const gated = [];
  const rows = (Array.isArray(urls) ? urls : []).slice(0, 3);
  for (const row of rows) {
    const url = String(row?.url || '');
    const title = clip(row?.title || row?.name || 'Dokument', 140) || 'Dokument';
    if (!allowedDownloadUrl(url)) {
      gated.push({ title, url, reason: 'Adressen kan ikke leses her.' });
      continue;
    }
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { Accept: '*/*', 'User-Agent': 'ProTop' },
        signal: AbortSignal.timeout(45000),
      });
      const mimeType = String(res.headers.get('content-type') || '');
      if (!res.ok) {
        gated.push({ title, url, reason: `Dokumentet svarte ${res.status}` });
        continue;
      }
      if (/text\/html/i.test(mimeType)) {
        gated.push({ title, url, reason: 'Filen krever innlogging på portalen.' });
        continue;
      }
      const buf = await takeBody(res);
      if (!buf) {
        gated.push({ title, url, reason: 'Filen er over 25 MB og leses ikke automatisk. Last den opp i tilbudet.' });
        continue;
      }
      const text = await textFromBuffer(buf, mimeType, url);
      if (text.length > 40) excerpts.push({ title, url, text: clip(text, READ_TEXT_CHARS) });
      else gated.push({ title, url, reason: 'Ingen åpen tekst. Last opp filen i tilbudet hvis AI skal lese den.' });
    } catch {
      gated.push({ title, url, reason: 'Filen kunne ikke leses. Åpne den på portalen og last den opp i tilbudet.' });
    }
  }
  return { excerpts, gated };
}

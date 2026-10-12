/** Leser offentlig konkurransetekst. Innloggede portalfiler blir stående som lenke. */
import { allowedDownloadUrl } from './anbud/portalCatalog.js';
import { extractPdfText } from './documentText.js';

function clip(value, max) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

async function textFromBuffer(buf, mimeType, url) {
  const mime = String(mimeType || '');
  const href = String(url || '').toLowerCase();
  if (/pdf/i.test(mime) || href.endsWith('.pdf')) {
    const parsed = await extractPdfText(buf);
    return String(parsed?.text || '');
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
        signal: AbortSignal.timeout(20000),
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
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2000000) {
        gated.push({ title, url, reason: 'Filen er for stor til automatisk lesing. Last den opp i tilbudet.' });
        continue;
      }
      const text = await textFromBuffer(buf, mimeType, url);
      if (text.length > 40) excerpts.push({ title, url, text: clip(text, 1500) });
      else gated.push({ title, url, reason: 'Ingen åpen tekst. Last opp filen i tilbudet hvis AI skal lese den.' });
    } catch {
      gated.push({ title, url, reason: 'Filen kunne ikke leses. Åpne den på portalen og last den opp i tilbudet.' });
    }
  }
  return { excerpts, gated };
}

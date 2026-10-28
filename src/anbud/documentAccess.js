/** Regler for når avtaledokumenter kan åpnes som originalfil vs. tekst. */

/** Filtyper som kan lastes opp ved registrering av inngått avtale. */
export const AGREEMENT_IMPORT_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.rtf',
  '.csv',
  '.eml',
  '.msg',
  '.html',
  '.htm',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
  'message/rfc822',
  'text/plain',
  'text/html',
  'text/csv',
  'text/rtf',
  'image/*',
].join(',');

/** PDF/Word/Excel skal aldri åpnes som OCR-tekst — bare originalfil. */
export function documentLooksBinary(doc) {
  const name = String(doc?.name || '');
  const mime = String(doc?.mimeType || '').toLowerCase();
  if (
    mime.includes('pdf')
    || mime.includes('word')
    || mime.includes('officedocument')
    || mime.includes('msword')
    || mime.includes('excel')
    || mime.includes('spreadsheet')
    || mime.includes('powerpoint')
    || mime.includes('presentation')
  ) return true;
  return /\.(pdf|docx?|xlsx?|pptx?)$/i.test(name);
}

function keptFileHref(value) {
  const href = String(value || '').trim();
  if (!href || href.startsWith('blob:')) return '';
  return href;
}

export function documentHasOriginalFile(doc) {
  return !!(
    keptFileHref(doc?.dataUrl)
    || keptFileHref(doc?.url)
    || keptFileHref(doc?.uri)
    || String(doc?.storagePath || '').trim()
  );
}

export function documentIsOpenable(doc) {
  if (documentHasOriginalFile(doc)) return true;
  if (documentLooksBinary(doc)) return false;
  return !!String(doc?.text || '').trim();
}

export function documentFileHref(doc) {
  return keptFileHref(doc?.dataUrl) || keptFileHref(doc?.url) || keptFileHref(doc?.uri) || '';
}

/** Forhåndsvisningsmodus for avtaledokumenter. */
export function documentPreviewKind(doc) {
  const name = String(doc?.name || '').toLowerCase();
  const mime = String(doc?.mimeType || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (
    mime.includes('wordprocessingml')
    || mime.includes('msword')
    || mime.includes('word')
    || /\.docx?$/i.test(name)
  ) return 'word';
  if (
    mime.includes('spreadsheetml')
    || mime.includes('excel')
    || mime.includes('sheet')
    || /\.xlsx?$/i.test(name)
    || name.endsWith('.csv')
  ) return 'excel';
  if (
    mime.includes('presentation')
    || mime.includes('powerpoint')
    || /\.pptx?$/i.test(name)
  ) return 'powerpoint';
  if (
    mime === 'message/rfc822'
    || mime.includes('outlook')
    || mime.includes('message')
    || /\.(eml|msg)$/i.test(name)
  ) return 'email';
  if (mime.includes('html') || /\.html?$/i.test(name)) return 'html';
  if (
    mime.startsWith('text/')
    || /\.(txt|rtf)$/i.test(name)
    || name === 'innlimt tekst'
  ) return 'text';
  return 'other';
}

export function documentPreviewLabel(kind) {
  switch (kind) {
    case 'pdf': return 'PDF';
    case 'image': return 'Bilde';
    case 'word': return 'Word';
    case 'excel': return 'Excel';
    case 'powerpoint': return 'PowerPoint';
    case 'email': return 'E-post';
    case 'html': return 'HTML';
    case 'text': return 'Tekst';
    default: return 'Dokument';
  }
}

/**
 * Filtyper som kan kjøre skript når nettleseren viser dem direkte (HTML, SVG, XML, skript).
 * En blob-URL har samme opphav som protop.no, så slike filer må aldri vises som side der.
 */
export function isActiveContentMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase();
  if (!m) return false;
  if (m === 'text/html' || m === 'application/xhtml+xml' || m === 'image/svg+xml') return true;
  if (m === 'text/xml' || m === 'application/xml' || m.endsWith('+xml')) return true;
  if (m.includes('javascript') || m.includes('ecmascript')) return true;
  return m === 'text/xsl' || m === 'multipart/x-mixed-replace' || m === 'application/x-shockwave-flash';
}

/** Typen en blob-URL på protop.no får. Aktivt innhold vises som ren tekst, aldri som side. */
export function safeBlobMime(mime) {
  const m = String(mime || '').trim();
  if (!m) return 'application/octet-stream';
  return isActiveContentMime(m) ? 'text/plain;charset=utf-8' : m;
}

/**
 * sandbox for opplastet HTML i forhåndsvisningen: tom liste = ingen skript, eget tomt
 * opphav (ingen tilgang til innloggingen), ingen skjema og ingen popups.
 */
export const UNTRUSTED_HTML_SANDBOX = '';

/** Office Online embed krever en offentlig https-URL (ikke data:/blob:). */
export function documentSupportsOfficeEmbed(doc) {
  const kind = documentPreviewKind(doc);
  if (!['word', 'excel', 'powerpoint'].includes(kind)) return false;
  const href = documentFileHref(doc);
  return /^https:\/\//i.test(href);
}

export function documentOfficeEmbedUrl(doc) {
  if (!documentSupportsOfficeEmbed(doc)) return '';
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentFileHref(doc))}`;
}

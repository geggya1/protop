/** Regler for når avtaledokumenter kan åpnes som originalfil vs. tekst. */

/** PDF/Word skal aldri åpnes som OCR-tekst — bare originalfil. */
export function documentLooksBinary(doc) {
  const name = String(doc?.name || '');
  const mime = String(doc?.mimeType || '').toLowerCase();
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('officedocument')) return true;
  return /\.(pdf|docx?|xlsx?|pptx?)$/i.test(name);
}

export function documentHasOriginalFile(doc) {
  return !!(doc?.dataUrl || doc?.url || doc?.uri);
}

export function documentIsOpenable(doc) {
  if (documentHasOriginalFile(doc)) return true;
  if (documentLooksBinary(doc)) return false;
  return !!String(doc?.text || '').trim();
}

export function documentFileHref(doc) {
  return doc?.dataUrl || doc?.url || doc?.uri || '';
}

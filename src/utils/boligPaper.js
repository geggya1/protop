/**
 * Pure helpers for Boligen paper / bilag entries (no Firebase).
 */

import { BOLIG_DOC_KINDS } from './boligmappaApis.js';

/** Kinds shown by default in «Nytt papir» — rest behind «Flere typer». */
export const BOLIG_PAPER_KIND_PRIMARY = ['receipt', 'invoice', 'warranty', 'other'];

export function boligPaperKindMeta(kindId) {
  return BOLIG_DOC_KINDS.find((k) => k.id === kindId) || BOLIG_DOC_KINDS.find((k) => k.id === 'other');
}

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Add calendar months to YYYY-MM-DD (noon local to avoid DST edge). */
export function addMonthsToDateKey(dateKey, months) {
  const s = String(dateKey || '').trim();
  const n = Number(months);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(n) || n <= 0) return '';
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Math.round(n));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Map OCR bilag → suggested Boligen paper fields.
 */
export function suggestBoligPaperFromBilag(bilag = {}) {
  const supplier = cleanStr(bilag.supplier || bilag.vendor, 120);
  const category = cleanStr(bilag.category, 40);
  const date = cleanStr(bilag.date, 32);
  const suggested = cleanStr(bilag.suggestedTitle, 120);
  const title = suggested
    || [supplier, category || (supplier ? 'kvittering' : '')].filter(Boolean).join(' · ')
    || 'Bilag';

  const lines = Array.isArray(bilag.lineItems)
    ? bilag.lineItems
      .slice(0, 10)
      .map((l) => cleanStr(l?.description, 80))
      .filter(Boolean)
    : [];

  const notesParts = [
    cleanStr(bilag.notes, 400),
    lines.length ? `Innhold: ${lines.join(', ')}` : '',
    bilag.amount != null && bilag.amount !== ''
      ? `Beløp: ${bilag.amount} ${cleanStr(bilag.currency || 'NOK', 8) || 'NOK'}`
      : '',
    bilag.invoiceNumber ? `Nr: ${cleanStr(bilag.invoiceNumber, 60)}` : '',
  ].filter(Boolean);

  let warrantyMonths = bilag.warrantyMonths != null && bilag.warrantyMonths !== ''
    ? Number(bilag.warrantyMonths)
    : null;
  if (!Number.isFinite(warrantyMonths) || warrantyMonths <= 0) warrantyMonths = null;

  let warrantyUntil = cleanStr(bilag.warrantyUntil || bilag.warrantyEnd, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(warrantyUntil)) warrantyUntil = '';
  if (!warrantyUntil && warrantyMonths && date) {
    warrantyUntil = addMonthsToDateKey(date, warrantyMonths);
  }

  const warrantyText = cleanStr(bilag.warrantyText || bilag.warranty, 200);

  return {
    title: title.slice(0, 120),
    notes: notesParts.join('\n').slice(0, 800),
    dateKey: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    warrantyUntil: warrantyUntil || null,
    warrantyMonths,
    warrantyText: warrantyText || null,
    supplier: supplier || null,
    amount: bilag.amount != null && bilag.amount !== '' && Number.isFinite(Number(bilag.amount))
      ? Number(bilag.amount)
      : null,
    currency: cleanStr(bilag.currency || 'NOK', 8).toUpperCase() || 'NOK',
  };
}

export function formatBoligPaperLine(entry, { vendorName = '', homeTitle = '', showHome = false } = {}) {
  const kind = boligPaperKindMeta(entry?.kind);
  const parts = [
    `${kind?.emoji || '📎'} ${entry?.title || entry?.fileName || 'Papir'}`,
    vendorName || null,
    entry?.supplier && entry.supplier !== vendorName ? entry.supplier : null,
    entry?.amount != null
      ? `${entry.amount} ${entry.currency || 'NOK'}`
      : null,
    entry?.warrantyUntil ? `garanti til ${entry.warrantyUntil}` : null,
    entry?.warrantyMonths && !entry?.warrantyUntil
      ? `${entry.warrantyMonths} mnd garanti`
      : null,
    entry?.downloadUrl || entry?.storagePath ? 'fil' : null,
    showHome && homeTitle ? homeTitle : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Sanitize entries before Firestore write — keeps file + OCR fields.
 */
export function cleanBoligEntries(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => {
      const downloadUrl = String(e?.downloadUrl || e?.url || '').trim() || null;
      const storagePath = String(e?.storagePath || '').trim() || null;
      const fileName = String(e?.fileName || e?.name || '').trim() || null;
      const title = String(e?.title || '').trim() || fileName || (downloadUrl || storagePath ? 'Bilag' : '');
      const warrantyMonths = e?.warrantyMonths != null && e.warrantyMonths !== ''
        ? Number(e.warrantyMonths)
        : null;
      const amount = e?.amount != null && e.amount !== '' ? Number(e.amount) : null;
      return {
        id: String(e?.id || '').trim() || `e_${Math.random().toString(36).slice(2, 8)}`,
        kind: BOLIG_DOC_KINDS.some((k) => k.id === e?.kind) ? e.kind : 'other',
        title,
        notes: String(e?.notes || '').trim(),
        dateKey: String(e?.dateKey || '').trim() || null,
        roomId: e?.roomId || null,
        contractorId: e?.contractorId || null,
        downloadUrl,
        storagePath,
        mimeType: String(e?.mimeType || '').trim() || null,
        fileName,
        size: e?.size != null && e.size !== '' ? Number(e.size) : null,
        warrantyUntil: String(e?.warrantyUntil || '').trim() || null,
        warrantyMonths: Number.isFinite(warrantyMonths) && warrantyMonths > 0 ? warrantyMonths : null,
        warrantyText: String(e?.warrantyText || '').trim() || null,
        supplier: String(e?.supplier || '').trim() || null,
        amount: Number.isFinite(amount) ? amount : null,
        currency: String(e?.currency || '').trim() || null,
      };
    })
    .filter((e) => e.title || e.downloadUrl || e.storagePath);
}

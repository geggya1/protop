/**
 * Innholdet som godkjennes. Samme funksjon brukes ved lagring, innsending og godkjenning,
 * så sjekksummen bare endres når selve dokumentet endres.
 */
import { normalizeBuilderField, normalizeSettings } from '../anbud/formBuilder.js';
import { contentHash, publishedRevision } from './model.js';

/** Malens innhold uten svar, med fast tekst i låste felt. */
export function templateSnapshot(template) {
  if (!template) return null;
  const settings = normalizeSettings(template.settings);
  return {
    title: String(template.title || '').trim(),
    intro: String(template.intro || '').trim(),
    category: template.category === 'avtale' ? 'avtale' : 'skjema',
    layout: settings.layout,
    useCompanyLogo: settings.useCompanyLogo,
    fields: (template.fields || [])
      .map((field) => normalizeBuilderField({ ...field, value: field?.editor === 'fast' ? field.value : '' }))
      .filter(Boolean),
  };
}

export function templateHash(template) {
  return contentHash(templateSnapshot(template));
}

/** Malen slik den ble godkjent, klar til utfylling. */
export function templateFromSnapshot(snapshot, base = {}) {
  if (!snapshot) return null;
  return {
    ...base,
    title: snapshot.title || base.title,
    intro: snapshot.intro || '',
    category: snapshot.category || base.category || 'skjema',
    settings: { ...(base.settings || {}), layout: snapshot.layout, useCompanyLogo: snapshot.useCompanyLogo },
    fields: snapshot.fields || [],
  };
}

export function handbookSnapshot(handbook) {
  if (!handbook) return null;
  return {
    title: String(handbook.title || 'Personalhåndbok').trim(),
    chapters: (handbook.chapters || []).map((row) => ({ id: row.id, title: row.title, body: row.body })),
  };
}

export function handbookHash(handbook) {
  return contentHash(handbookSnapshot(handbook));
}

/** Gjeldende godkjente håndbok til lesing: { title, chapters, version, at } eller null. */
export function handbookFromControl(control) {
  const pub = publishedRevision(control);
  if (!pub?.snapshot) return null;
  return { title: pub.snapshot.title || control.title, chapters: pub.snapshot.chapters || [], version: pub.revision, at: pub.approvedAt };
}

/** Den delen av et sitat som kan finnes igjen i én linje (lengste linje i sitatet). */
function quoteNeedle(quote) {
  return String(quote || '').split(/\n+/).map((row) => row.trim()).sort((a, b) => b.length - a.length)[0] || '';
}

/**
 * Del en tekstlinje i biter der sitatene fra merknader er merket: [{ text, hit }].
 * Brukes til å vise hvor merknadene står, for dem som har lov til å se dem.
 */
export function markParts(line, quotes) {
  const value = String(line ?? '');
  const needles = [...new Set((quotes || []).map(quoteNeedle).filter((row) => row.length >= 3))];
  if (!needles.length || !value) return [{ text: value, hit: false }];
  const lower = value.toLocaleLowerCase('nb-NO');
  const ranges = [];
  needles.forEach((needle) => {
    const n = needle.toLocaleLowerCase('nb-NO');
    let at = lower.indexOf(n);
    while (at >= 0) {
      ranges.push([at, at + n.length]);
      at = lower.indexOf(n, at + n.length);
    }
  });
  if (!ranges.length) return [{ text: value, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(([from, to]) => {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  });
  const parts = [];
  let pos = 0;
  merged.forEach(([from, to]) => {
    if (from > pos) parts.push({ text: value.slice(pos, from), hit: false });
    parts.push({ text: value.slice(from, to), hit: true });
    pos = to;
  });
  if (pos < value.length) parts.push({ text: value.slice(pos), hit: false });
  return parts;
}

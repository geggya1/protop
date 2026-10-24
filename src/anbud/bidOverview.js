import { parseDeadline } from './noticeText.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Nedtelling til en frist, laget for store fristfelt.
 * tone: danger (utløpt / i dag), warn (≤ 7 dager), brand (≤ 14), ink (lenger), muted (mangler).
 */
export function deadlineCountdown(value, now = new Date()) {
  const date = parseDeadline(value);
  if (!date) {
    return { ok: false, passed: false, daysLeft: null, big: '–', unit: 'Ikke oppgitt', dateLabel: '', tone: 'muted' };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysLeft = Math.round((day - today) / 86400000);
  const time = date.getHours() || date.getMinutes() ? ` kl. ${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
  const dateLabel = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}${time}`;
  const passed = date.getTime() < now.getTime();
  if (passed) {
    return { ok: true, passed: true, daysLeft, big: 'Utløpt', unit: '', dateLabel, tone: 'danger' };
  }
  if (daysLeft <= 0) {
    return { ok: true, passed: false, daysLeft: 0, big: 'I dag', unit: '', dateLabel, tone: 'danger' };
  }
  const tone = daysLeft <= 7 ? 'warn' : daysLeft <= 14 ? 'brand' : 'ink';
  return {
    ok: true,
    passed: false,
    daysLeft,
    big: String(daysLeft),
    unit: daysLeft === 1 ? 'dag igjen' : 'dager igjen',
    dateLabel,
    tone,
  };
}

/** ISO- eller norsk frist som lesbar dato. Ukjent format vises som det er. */
export function formatDeadline(value) {
  const info = deadlineCountdown(value);
  return info.ok ? info.dateLabel : String(value || '');
}

const GROUPS = [
  { id: 'kunngjoring', name: 'Kunngjøring', test: (file) => file.source === 'kunngjøring' || /kunngj(ø|o)ring|notice/i.test(file.name) },
  { id: 'qa', name: 'Spørsmål, svar og rettelser', test: (file) => /sp(ø|o)rsm(å|a)l|svar|q\s*&\s*a|rettelse|tilleggsinfo|addend|clarif/i.test(file.name) },
  { id: 'kontrakt', name: 'Kontrakt', test: (file) => /kontrakt|avtale|contract|\bss[a-z]{1,2}\b|\bns\s?\d{4}/i.test(file.name) },
  { id: 'bilag', name: 'Bilag og vedlegg', test: (file) => /bilag|vedlegg|appendi|annex|attachment|del\s*[a-z0-9]\b/i.test(file.name) },
  { id: 'skjema', name: 'Skjema og maler', test: (file) => /skjema|egenerkl|espd|tilbudsbrev|mal\b|template|form\b|prisark/i.test(file.name) },
  { id: 'grunnlag', name: 'Konkurransegrunnlag', test: (file) => /konkurranse|grunnlag|invitasjon|tender|itt\b|rfp|beskrivelse|spesifikasjon/i.test(file.name) },
];

const OTHER = { id: 'andre', name: 'Andre dokumenter' };

// «Kap D2.01 …», «Kapittel C1 …»: grunnlag delt i kapitler (Statens vegvesen o.l.).
const CHAPTER = /^kap(?:ittel)?\.?\s*([A-H])\s*\d/i;

/** Mappen et nedlastet dokument hører hjemme i, ut fra navn og kilde. */
export function groundGroupFor(file) {
  const chapter = String(file?.name || '').match(CHAPTER)?.[1]?.toUpperCase();
  if (chapter) return { id: `kap-${chapter}`, name: `Kapittel ${chapter}` };
  return GROUPS.find((group) => group.test(file || {})) || OTHER;
}

const collator = typeof Intl !== 'undefined'
  ? new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' })
  : null;

// «Kap D2.01» og «Kapittel D0» sorteres på kapittelkoden, ikke på ordet foran.
function sortKey(name) {
  return String(name || '').replace(/^kap(?:ittel)?\.?\s*/i, '');
}

function byName(a, b) {
  const x = sortKey(a.name);
  const y = sortKey(b.name);
  return collator ? collator.compare(x, y) : x.localeCompare(y);
}

/**
 * Ordner nedlastede filer i en fast mappestruktur:
 * Kunngjøring → Konkurransegrunnlag → Bilag → Skjema → Kontrakt → Q&A → Andre.
 * Tomme mapper tas ikke med. Filene sorteres naturlig (Bilag 2 før Bilag 10).
 */
export function groundFileTree(files) {
  const buckets = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    const group = groundGroupFor(file);
    if (!buckets.has(group.id)) buckets.set(group.id, { ...group, files: [] });
    buckets.get(group.id).files.push(file);
  }
  const chapters = [...buckets.keys()].filter((id) => id.startsWith('kap-')).sort();
  return ['kunngjoring', 'grunnlag', ...chapters, 'bilag', 'skjema', 'kontrakt', 'qa', 'andre']
    .filter((id) => buckets.has(id))
    .map((id) => {
      const { test, ...group } = buckets.get(id);
      return { ...group, files: [...group.files].sort(byName) };
    });
}

/** Kort filtype til merkelapp: PDF, DOCX, XLSX … */
export function fileTypeLabel(file) {
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (ext) return ext.toUpperCase();
  const mime = String(file?.mimeType || '');
  if (mime.includes('pdf')) return 'PDF';
  if (mime.startsWith('image/')) return 'BILDE';
  if (mime.startsWith('text/')) return 'TXT';
  return 'FIL';
}

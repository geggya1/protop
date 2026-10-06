/**
 * Leser en CV-fil og legger innholdet inn i medarbeiderens CV.
 * PDF og bilde går til OCR og AI. Word og tekst sendes som tekst til samme tolking.
 * Eksisterende utfylte felt beholdes. Nye avsnitt legges til.
 */
import { zipEntries } from '../anbud/customerImport.js';
import { fileMedia } from '../imports/interpret.js';
import { normalizeEmployee } from './model.js';

export const CV_IMPORT_ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.docx',
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

function decodeText(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '').trim();
}

export async function textFromDocx(bytes) {
  let files = [];
  try {
    files = await zipEntries(bytes);
  } catch {
    return '';
  }
  const doc = (files || []).find((file) => file.name === 'word/document.xml');
  if (!doc?.data) return '';
  const xml = new TextDecoder().decode(doc.data);
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function cvSourceText(bytes, filename = '') {
  const name = String(filename || '').toLowerCase();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (name.endsWith('.docx')) return textFromDocx(raw);
  if (name.endsWith('.txt') || name.endsWith('.md')) return decodeText(raw);
  return '';
}

export async function readCvImport(bytes, filename, { ask, familyId } = {}) {
  if (!ask || !familyId) throw new Error('CV-filer leses med OCR og AI. Åpne selskapet og prøv igjen.');
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const text = await cvSourceText(raw, filename);
  if (text.length >= 40) {
    const result = await ask({ mode: 'ocr', kind: 'cv', familyId, filename, text });
    return { cv: result?.cv || {}, engine: result?.engine || 'gemini', summary: result?.summary || '' };
  }
  const media = fileMedia(raw, filename);
  if (media.kind === 'table') throw new Error('Last opp CV som PDF, bilde, Word eller tekst.');
  const result = await ask({ mode: 'ocr', kind: 'cv', familyId, filename, media, bytes: raw });
  return { cv: result?.cv || {}, engine: result?.engine || 'ocr+gemini', summary: result?.summary || '' };
}

function identity(parts) {
  return parts.map((part) => String(part || '').trim().toLowerCase()).filter(Boolean).join('|');
}

function appendNew(current, incoming, keyOf) {
  const seen = new Set((current || []).map(keyOf).filter(Boolean));
  const items = [...(current || [])];
  let count = 0;
  for (const item of incoming || []) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    count += 1;
  }
  return { items, count };
}

const LIST_LABELS = {
  education: ['utdanning', 'utdanninger'],
  certifications: ['sertifisering', 'sertifiseringer'],
  courses: ['kurs', 'kurs'],
  experience: ['erfaring', 'erfaringer'],
  projects: ['prosjekt', 'prosjekter'],
};

function listNote(key, count) {
  const [one, many] = LIST_LABELS[key];
  return count === 1 ? one : `${count} ${many}`;
}

export function applyImportedCv(employee, cv) {
  const base = normalizeEmployee(employee);
  const incoming = cv && typeof cv === 'object' ? cv : {};
  const added = [];
  const kept = [];
  if (incoming.headline) {
    if (!base.cv.headline) {
      base.cv.headline = incoming.headline;
      added.push('overskrift');
    } else if (base.cv.headline !== incoming.headline) kept.push('overskrift');
  }
  if (incoming.summary) {
    if (!base.cv.summary) {
      base.cv.summary = incoming.summary;
      added.push('oppsummering');
    } else if (base.cv.summary !== incoming.summary) kept.push('oppsummering');
  }
  if (incoming.language && incoming.language !== base.person.language && (!base.person.language || base.person.language === 'Norsk bokmål')) {
    base.person.language = incoming.language;
    added.push('språk');
  } else if (incoming.language && incoming.language !== base.person.language) {
    kept.push('språk');
  }
  for (const [key, label] of [['nationality', 'nasjonalitet'], ['maritalStatus', 'sivil status']]) {
    if (!incoming[key]) continue;
    if (!base.person[key]) {
      base.person[key] = incoming[key];
      added.push(label);
    } else if (base.person[key] !== incoming[key]) kept.push(label);
  }
  const lists = [
    ['education', (row) => identity([row.school, row.program, row.from])],
    ['certifications', (row) => identity([row.title])],
    ['courses', (row) => identity([row.date, row.title])],
    ['experience', (row) => identity([row.employer, row.title, row.from])],
    ['projects', (row) => identity([row.title, row.client, row.period])],
  ];
  for (const [key, keyOf] of lists) {
    const merged = appendNew(base.cv[key], incoming[key], keyOf);
    base.cv[key] = merged.items;
    if (merged.count) added.push(listNote(key, merged.count));
  }
  return { employee: normalizeEmployee(base), added, kept };
}

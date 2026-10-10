/**
 * Leser et skjema slik en CV leses.
 * PDF og bilde går til OCR og AI, med sidebildet med. Word og tekst tolkes som tekst
 * og slås sammen med det AI ser. Malen som er åpen beholder id og svar.
 */
import { textFromDocx } from '../employees/cvImport.js';
import { prepareImportBody } from '../imports/filePayload.js';
import { shrinkImportImage } from '../imports/interpretClient.js';
import { formFromPlainText, mergeFormReads } from './formBuilder.js';
import { generateCompanyForm } from './intakeClient.js';

export const FORM_IMPORT_ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.docx',
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

function decodeText(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '').trim();
}

function titleFromName(filename) {
  return String(filename || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80);
}

export async function formSourceText(bytes, filename = '') {
  const name = String(filename || '').toLowerCase();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (name.endsWith('.docx')) return textFromDocx(raw);
  if (name.endsWith('.txt') || name.endsWith('.md')) return decodeText(raw);
  return '';
}

export async function askCompanyForm(bytes, filename, mime = '') {
  const prepared = await prepareImportBody(
    { bytes, filename, mime },
    { shrinkImage: shrinkImportImage },
  );
  const dataUrl = `data:${prepared.mime};base64,${prepared.imageBase64}`;
  return generateCompanyForm(dataUrl, filename);
}

export async function readFormImport(bytes, filename, { ask } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const text = await formSourceText(raw, filename);
  const local = text.length >= 12 ? formFromPlainText(text, titleFromName(filename)) : null;
  if (!ask) {
    if (!local?.ok) throw new Error('Last opp skjema som PDF, bilde, Word eller tekst.');
    return { form: local.form, engine: 'text', summary: '' };
  }
  try {
    const result = await ask({ bytes: raw, filename, mime: '', text });
    const merged = mergeFormReads(local?.ok ? local.form : null, result?.form);
    if (merged?.fields?.length) {
      return {
        form: merged,
        engine: result?.engine || (local?.ok ? 'text' : 'gemini'),
        summary: result?.summary || '',
      };
    }
  } catch (err) {
    if (local?.ok) return { form: local.form, engine: 'text', summary: '' };
    throw err;
  }
  if (local?.ok) return { form: local.form, engine: 'text', summary: '' };
  throw new Error('Fant ikke et skjema i dokumentet.');
}

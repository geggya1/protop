/**
 * Søknader inn fra fil: last opp originalen og les den med OCR og AI.
 * Word og tekst leses lokalt og sendes som tekst. PDF og bilder går til OCR på serveren.
 * Uten AI (eller når kallet feiler) fylles navn, e-post og telefon fra teksten og filnavnet.
 */
import { contactFromText, nameFromFilename } from './applicationRead.js';

export const APPLICATION_ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.docx',
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

const READABLE = /\.(pdf|png|jpe?g|webp|heic|txt|md|docx)$/i;

export function canReadApplicationFile(name) {
  return READABLE.test(String(name || ''));
}

/** Trygt filnavn i lagringsstien. */
export function storageSafeName(name) {
  const base = String(name || 'soknad')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (base || 'soknad').slice(-80);
}

export async function fileBytes(file) {
  const blob = file?.blob || (typeof Blob !== 'undefined' && file instanceof Blob ? file : null);
  if (blob && typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  if (file?.uri && typeof fetch === 'function') {
    const res = await fetch(file.uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('Kunne ikke lese filen');
}

/**
 * Leser én søknadsfil. Svarer { read, engine, error }.
 * read følger sanitizeApplicationRead: { candidate, profile, assessment }.
 */
export async function readApplicationFile({
  familyId, bytes, filename, mime = '', job = null, ask = null,
}) {
  const name = String(filename || 'soknad');
  let text = '';
  try {
    const { cvSourceText } = await import('../employees/cvImport.js');
    text = await cvSourceText(bytes, name);
  } catch {
    text = '';
  }
  const local = {
    candidate: { ...contactFromText(text, name), location: '' },
    profile: null,
    assessment: null,
  };
  if (!local.candidate.name) local.candidate.name = nameFromFilename(name);
  if (!familyId) return { read: local, engine: 'local', error: '' };

  try {
    const askFn = ask || (await import('../imports/interpretClient.js')).askImportInterpret;
    const jobContext = job ? {
      title: String(job.title || ''),
      requirements: String(job.requirements || ''),
      description: String(job.description || ''),
    } : undefined;
    const payload = text.length >= 40
      ? { familyId, kind: 'application', mode: 'ocr', filename: name, text, job: jobContext }
      : {
        familyId,
        kind: 'application',
        mode: 'ocr',
        filename: name,
        bytes,
        media: { mime: mime || undefined },
        job: jobContext,
      };
    const result = await askFn(payload);
    if (!result?.candidate) {
      return { read: local, engine: 'local', error: 'AI-lesing av søknader er ikke klar ennå. Navn og kontaktinfo er hentet lokalt.' };
    }
    const candidate = {
      name: result.candidate.name || local.candidate.name,
      email: result.candidate.email || local.candidate.email,
      phone: result.candidate.phone || local.candidate.phone,
      location: result.candidate.location || '',
    };
    return {
      read: { candidate, profile: result.profile || null, assessment: result.assessment || null },
      engine: result.engine || 'gemini',
      error: '',
    };
  } catch (error) {
    return { read: local, engine: 'local', error: String(error?.message || error || 'AI feilet') };
  }
}

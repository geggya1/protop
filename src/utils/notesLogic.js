/**
 * Ren logikk for notater: autolagring, tidsavbrudd og flytting av gamle talenotater.
 * Ingen Firebase her, så det kan testes med node --test.
 */
import { structuredNoteBody } from './noteAi.js';
import { isOrganizationType } from './groupTypes.js';

/** Pause i skrivingen før notatet lagres av seg selv. */
export const NOTE_AUTOSAVE_MS = 1200;

/**
 * Firestore kjører med minnecache: offline løses ikke updateDoc før serveren svarer.
 * Etter så lenge viser vi at lagringen venter på nett i stedet for evig «Lagrer…».
 */
export const NOTE_SAVE_TIMEOUT_MS = 8000;

export function noteSaveTimeoutError() {
  const err = new Error('Ingen svar fra serveren.');
  err.code = 'timeout';
  return err;
}

/** Løs som promise, eller avvis med code 'timeout' etter ms. Selve skrivingen fortsetter i bakgrunnen. */
export function withSaveTimeout(promise, ms = NOTE_SAVE_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(noteSaveTimeoutError()), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

export function isOfflineSaveError(err) {
  const code = String(err?.code || '').replace(/^firestore\//, '');
  return code === 'timeout' || code === 'unavailable' || code === 'deadline-exceeded';
}

/** Tekst under tittelen i notatredigeringen. */
export function noteSaveStatusText(status) {
  switch (status) {
    case 'dirty': return 'Ikke lagret ennå';
    case 'saving': return 'Lagrer…';
    case 'saved': return 'Lagret';
    case 'offline': return 'Venter på nett. Endringene lagres når du er på nett igjen, så lenge appen er åpen.';
    case 'error': return 'Klarte ikke lagre. Prøv igjen.';
    default: return '';
  }
}

export function noteSaveStatusFromError(err) {
  return isOfflineSaveError(err) ? 'offline' : 'error';
}

/** Det som lagres fra redigeringen. */
export function noteDraftPatch(title, body) {
  return {
    title: String(title || '').trim() || 'Uten tittel',
    body: String(body || ''),
  };
}

/** Avviker utkastet fra det som sist ble lagret (eller lest fra serveren)? */
export function noteDraftDirty(draft, saved) {
  if (!saved) return false;
  return String(draft?.title ?? '') !== String(saved.title ?? '')
    || String(draft?.body ?? '') !== String(saved.body ?? '');
}

/** Slettede notater og notater som ikke finnes, vises som «Notatet finnes ikke». */
export function isNoteMissing(note) {
  if (note === undefined) return false;
  return !note || note.deleted === true || note.permanentlyDeleted === true;
}

/**
 * Gamle talenotater ligger under users/{uid}/voiceNotes og er personlige.
 * De skal aldri flyttes inn i en bedrift. groupType må være kjent.
 */
export function canMigrateVoiceNotesInto(groupType) {
  if (typeof groupType !== 'string' || !groupType.trim()) return false;
  return !isOrganizationType(groupType);
}

/** Fast id per talenotat, så samme notat ikke kan lages to ganger. */
export function migratedVoiceNoteId(voiceNoteId) {
  return `voice-${String(voiceNoteId || '').replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export function voiceNoteNeedsMigration(vn) {
  return !!vn && !vn.deleted && !vn.migratedToFamilyNoteId;
}

/** Feltene til det nye notatet (uten tidsstempler). */
export function familyNoteFromVoiceNote(vn, uid, creatorName) {
  const body = structuredNoteBody({
    title: vn?.title,
    summary: vn?.summary,
    body: vn?.body || vn?.summary,
  }) || vn?.transcript || '';
  return {
    title: String(vn?.title || '').trim() || 'Lydnotat',
    body,
    bodyFormat: 'markdown',
    createdBy: uid,
    createdByName: creatorName || '',
    memberIds: [uid],
    visibility: 'private',
    archived: false,
    deleted: false,
    source: 'voice',
    transcript: vn?.transcript || '',
    summary: vn?.summary || body.slice(0, 280),
    keyPoints: [],
    durationMs: vn?.durationMs || 0,
    voiceNoteId: vn?.id || null,
  };
}

function foldText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Søk i Notater: alle ordene må finnes i tittel, tekst, sammendrag, transkripsjon
 * eller forfatter. Store/små bokstaver og aksenter teller ikke.
 */
export function filterNotesByQuery(notes, query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return notes || [];
  return (notes || []).filter((n) => {
    const hay = foldText([n?.title, n?.body, n?.summary, n?.transcript, n?.createdByName].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Slettede timeføringer: les slettelloggen og gjenopprett en føring.
 * Loggen (families/{id}/timeEntryDeletions) kan bare leses av dem som har innsyn i andres
 * timer, HR eller økonomi (timeDeletionReader i firestore.rules). Andre får denied: false.
 */
import { restoreReason, restoredTimeEntry } from '../arbeid/timeEntryRestore.js';
import { saveTimeEntries } from './timeEntryStorage.js';

const PAGE = 200;

function text(value) {
  return String(value ?? '').trim();
}

async function bits() {
  const [fs, { db }] = await Promise.all([import('firebase/firestore'), import('../../firebase.js')]);
  return { ...fs, db };
}

function denied(error) {
  const code = String(error?.code || '');
  return code.includes('permission-denied') || /insufficient permissions/i.test(String(error?.message || ''));
}

/**
 * De siste slettingene og hvilke av dem som allerede er gjenopprettet.
 * @returns {Promise<{ ok: boolean, denied?: boolean, records: object[], restored: Set<string>, error?: string }>}
 */
export async function loadTimeEntryDeletions(companyId) {
  const id = text(companyId);
  if (!id) return { ok: false, records: [], restored: new Set() };
  try {
    const b = await bits();
    const col = b.collection(b.db, 'families', id, 'timeEntryDeletions');
    const snap = await b.getDocs(b.query(col, b.orderBy('at', 'desc'), b.limit(PAGE)));
    const records = snap.docs.map((item) => ({ ...item.data(), id: item.id }));
    const restored = await loadRestored(b, id, records.map((row) => text(row.entryId)).filter(Boolean));
    return { ok: true, records, restored };
  } catch (error) {
    if (denied(error)) return { ok: false, denied: true, records: [], restored: new Set() };
    return { ok: false, records: [], restored: new Set(), error: 'Kunne ikke hente slettede timer.' };
  }
}

/** Id-ene (restoredFrom) blant entryIds som allerede er lagt inn igjen. */
async function loadRestored(b, companyId, entryIds) {
  const out = new Set();
  const ids = [...new Set(entryIds)];
  const col = b.collection(b.db, 'families', companyId, 'timeEntries');
  for (let at = 0; at < ids.length; at += 30) {
    const chunk = ids.slice(at, at + 30);
    const snap = await b.getDocs(b.query(col, b.where('restoredFrom', 'in', chunk)));
    snap.docs.forEach((item) => out.add(text(item.data()?.restoredFrom)));
  }
  return out;
}

/**
 * Legg en slettet føring inn igjen. Kaster ved feil (for eksempel uten rett til å føre timer
 * for andre), så skjermen kan vise det.
 */
export async function restoreDeletedTimeEntry(companyId, record) {
  const entry = restoredTimeEntry(record);
  if (!entry) throw new Error('Slettingen mangler dato, prosjekt eller ansatt, så timen kan ikke gjenopprettes.');
  await saveTimeEntries(companyId, [entry], { previous: [], reason: restoreReason(record) });
  return entry;
}

/**
 * Private hendelser i bedriftskalenderen (SOS-08, REV-11).
 *
 * En hendelse for «bare utvalgte» (audience 'selected') leses bare av den som laget den og de
 * inviterte. Det kan reglene bare håndheve når kalenderen listes med filtre (felles, invitert,
 * egne), og eldre apper lister hele samlingen. Derfor gjelder filtrene først når bedriften har
 * private hendelser: appen setter da privateEvents: true på gruppen (sealCompanyCalendar), og
 * reglene lar ingen slå det av igjen. Før det kan hele kalenderen listes som før.
 *
 * Før flagget settes, får eldre hendelser uten audience feltet (samme tolkning som kalenderen:
 * uten mottakere = hele gruppen), så kollegene fortsatt ser dem gjennom de filtrerte spørringene.
 */
import {
  collection, doc, getDoc, getDocs, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isFamilyAudience } from './events.js';
import { isOrganizationType } from './groupTypes.js';

const BATCH_SIZE = 400;
const sealed = new Set();

/** Hendelser uten audience og hvilken audience de skal ha. Rader: { id, ...data }. */
export function legacyAudiencePatches(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((row) => row?.id && !row.audience)
    .map((row) => ({ id: row.id, audience: isFamilyAudience(row) ? 'family' : 'selected' }));
}

/** Om kalenderen har en privat hendelse (og flagget derfor skal settes). */
export function hasPrivateEvents(events = []) {
  return (Array.isArray(events) ? events : []).some((row) => row?.audience === 'selected');
}

/**
 * Sett privateEvents på bedriften, etter at eldre hendelser har fått audience. Én gang per økt
 * og selskap; gjør ingenting for andre grupper eller når flagget alt er satt.
 * events: hele kalenderen når den allerede er lest (lytteren), ellers leses den her.
 * Må kjøres mens hele samlingen fortsatt kan listes (før flagget er satt).
 */
export async function sealCompanyCalendar(familyId, events = null) {
  const id = String(familyId || '').trim();
  if (!id || sealed.has(id)) return false;
  sealed.add(id);
  try {
    const snap = await getDoc(doc(db, 'families', id));
    const family = snap.exists() ? snap.data() || {} : null;
    if (!family || !isOrganizationType(family.type) || family.privateEvents === true) return false;
    const list = Array.isArray(events)
      ? events
      : (await getDocs(collection(db, 'families', id, 'events'))).docs.map((item) => ({ id: item.id, ...item.data() }));
    const patches = legacyAudiencePatches(list);
    for (let i = 0; i < patches.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      patches.slice(i, i + BATCH_SIZE).forEach((row) => {
        batch.update(doc(db, 'families', id, 'events', row.id), { audience: row.audience });
      });
      await batch.commit();
    }
    await updateDoc(doc(db, 'families', id), { privateEvents: true });
    return true;
  } catch (error) {
    // Prøv igjen neste gang kalenderen åpnes.
    sealed.delete(id);
    throw error;
  }
}

/** Bare for tester. */
export function resetCalendarSeal() {
  sealed.clear();
}

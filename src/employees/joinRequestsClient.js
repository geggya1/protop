/**
 * «Be om å bli med» (orgnr): forespørslene ligger i families/{id}/joinRequests/{uid}
 * (skrevet av requestCompanyJoin). De vises under Ansatte → Inviter brukere. Inviter fyller
 * ut skjemaet; serveren lukker forespørselen når personen godtar invitasjonen.
 */
import {
  addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase';

function text(value) {
  return String(value ?? '').trim();
}

/** Ventende forespørsler, eldste først. */
export function watchCompanyJoinRequests(companyId, onData) {
  if (!companyId) {
    onData([]);
    return () => {};
  }
  const qy = query(collection(db, 'families', companyId, 'joinRequests'), where('status', '==', 'pending'));
  return onSnapshot(qy, (snap) => {
    const rows = snap.docs
      .map((row) => ({ id: row.id, ...row.data() }))
      .filter((row) => row.kind === 'member' || row.source === 'orgnr' || !row.kind)
      .map((row) => ({
        id: row.id,
        uid: text(row.uid || row.parentUid || row.id),
        name: text(row.name || row.parentName),
        email: text(row.email || row.parentEmail).toLowerCase(),
        createdAt: text(row.createdAt),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    onData(rows);
  }, () => onData([]));
}

/** Avvis forespørselen og si fra til personen. */
export async function declineCompanyJoinRequest({ companyId, request, actorUid, companyName }) {
  if (!companyId || !request?.id) return;
  const at = new Date().toISOString();
  await updateDoc(doc(db, 'families', companyId, 'joinRequests', request.id), {
    status: 'declined',
    declinedAt: at,
    declinedBy: actorUid || null,
    updatedAt: at,
  });
  if (!request.uid || !actorUid) return;
  await addDoc(collection(db, 'users', request.uid, 'notifications'), {
    eventType: 'companyJoinDeclined',
    title: 'Forespørselen er avslått',
    body: `Forespørselen om å bli med i «${text(companyName) || 'bedriften'}» er avslått.`,
    familyId: null,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
    seen: false,
  }).catch(() => {});
}

/** Fornavn og etternavn fra navnet i forespørselen. */
export function splitRequestName(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
}

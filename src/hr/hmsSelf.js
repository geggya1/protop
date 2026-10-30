/**
 * HMS-kortet den ansatte registrerer selv på Min side › Gjøremål. Den ansatte kan ikke skrive
 * HR-tilstanden, så kortet lagres i sin egen skjermede del av ansattposten
 * (families/{id}/employeesPrivate/{ansatt-id}, feltet hmsCard). Den leses av den ansatte selv,
 * eier, administratorer og HR (firestore.rules). HR slår det sammen med kortene i HR
 * (mergeHmsCards i hmsCard.js), og det nyeste vinner.
 */
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeHmsCard } from './hmsCard.js';

function cid(value) {
  return String(value || '').trim();
}

function privateRef(companyId, employeeId) {
  return doc(db, 'families', cid(companyId), 'employeesPrivate', cid(employeeId));
}

export async function loadOwnHmsCard(companyId, employeeId) {
  if (!cid(companyId) || !cid(employeeId)) return null;
  try {
    const snap = await getDoc(privateRef(companyId, employeeId));
    const card = snap.exists() ? snap.data()?.hmsCard : null;
    return card ? normalizeHmsCard({ ...card, employeeId }) : null;
  } catch {
    return null;
  }
}

/** Lagre kortet. Returnerer det lagrede kortet. */
export async function saveOwnHmsCard(companyId, employeeId, card) {
  const next = normalizeHmsCard({ ...card, employeeId, updatedAt: new Date().toISOString() });
  await setDoc(privateRef(companyId, employeeId), { hmsCard: next, employeeId: cid(employeeId) }, { merge: true });
  return next;
}

/** Alle kort de ansatte har registrert selv. For HR. Uten lesetilgang: tom liste. */
export async function loadSelfHmsCards(companyId) {
  if (!cid(companyId)) return [];
  try {
    const snap = await getDocs(collection(db, 'families', cid(companyId), 'employeesPrivate'));
    return snap.docs
      .map((row) => (row.data()?.hmsCard ? normalizeHmsCard({ ...row.data().hmsCard, employeeId: row.id }) : null))
      .filter(Boolean);
  } catch {
    return [];
  }
}

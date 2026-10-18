import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

/** Daglig SSB-registrering skrevet av den planlagte funksjonen. */
export async function loadRemoteIndexSnapshot() {
  const snap = await getDoc(doc(db, 'system', 'indeksSsb'));
  return snap.exists() ? snap.data() : null;
}

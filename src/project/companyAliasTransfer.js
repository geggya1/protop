/**
 * Kopier ansatte, timer og anbud fra alias-familier til hovednummeret.
 * Kilden slettes ikke. Finnes id-en allerede på hovednummeret, hoppes den over.
 */
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { mergeAnbudStates } from '../anbud/model.js';
import { persistAnbudState } from '../anbud/storage.js';

async function copyMissingDocs(aliasId, canonicalId, collectionName) {
  const snap = await getDocs(collection(db, 'families', aliasId, collectionName));
  let copied = 0;
  for (const row of snap.docs) {
    const target = doc(db, 'families', canonicalId, collectionName, row.id);
    const existing = await getDoc(target);
    if (existing.exists()) continue;
    await setDoc(target, row.data(), { merge: true });
    copied += 1;
  }
  return copied;
}

export async function copyAliasRecordsToCanonical(canonicalId, aliasIds = []) {
  const canonical = String(canonicalId || '').trim();
  const ids = [...new Set((aliasIds || []).map((id) => String(id || '').trim()).filter((id) => id && id !== canonical))];
  if (!canonical || !ids.length) return { employees: 0, hours: 0, notices: 0 };
  let employees = 0;
  let hours = 0;
  let notices = 0;
  let anbud = null;
  for (const aliasId of ids) {
    employees += await copyMissingDocs(aliasId, canonical, 'employees');
    hours += await copyMissingDocs(aliasId, canonical, 'timeEntries');
    const anbudSnap = await getDoc(doc(db, 'families', aliasId, 'anbud', 'state'));
    if (anbudSnap.exists()) {
      anbud = mergeAnbudStates(anbud || { notices: [] }, { notices: anbudSnap.data()?.notices || [] });
    }
  }
  if (anbud?.notices?.length) {
    const currentSnap = await getDoc(doc(db, 'families', canonical, 'anbud', 'state'));
    const current = currentSnap.exists() ? currentSnap.data() : { notices: [] };
    const merged = mergeAnbudStates(current, anbud);
    await persistAnbudState(merged, canonical);
    notices = merged.notices?.length || 0;
  }
  return { employees, hours, notices };
}

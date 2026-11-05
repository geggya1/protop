/**
 * Lagring av barna til en ansatt: detaljene i employeesPrivate (skjermet), fødselsårene
 * på ansattposten (extras.childCare). Den ansatte kan skrive begge for sin egen post
 * (firestore.rules: employeesPrivate og empUpdateOk for egen post).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { childCareSummary, normalizeChildCare } from './childCare.js';

function ids(companyId, employeeId) {
  const c = String(companyId || '').trim();
  const e = String(employeeId || '').trim();
  if (!c || !e) throw new Error('Mangler bedrift eller ansatt.');
  return [c, e];
}

export async function loadChildCare(companyId, employeeId) {
  const [c, e] = ids(companyId, employeeId);
  const snap = await getDoc(doc(db, 'families', c, 'employeesPrivate', e));
  return normalizeChildCare(snap.exists() ? snap.data()?.childCare : {});
}

export async function saveChildCare(companyId, employeeId, input, { by = '' } = {}) {
  const [c, e] = ids(companyId, employeeId);
  const stamp = new Date().toISOString();
  const care = { ...normalizeChildCare(input), updatedAt: stamp, updatedBy: String(by || '') };
  await setDoc(doc(db, 'families', c, 'employeesPrivate', e), { childCare: care, employeeId: e, updatedAt: stamp }, { merge: true });
  const summary = childCareSummary(care);
  // Bare extras.childCare endres på posten (merge på et kart erstatter ikke andre felt).
  await setDoc(doc(db, 'families', c, 'employees', e), { extras: { childCare: summary } }, { merge: true });
  return { care, summary };
}

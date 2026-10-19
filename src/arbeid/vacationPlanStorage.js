/**
 * Ferieplan: families/{companyId}/hr/vacationPlan
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeVacationPlan } from './vacationPlan.js';

function planRef(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'hr', 'vacationPlan');
}

export async function loadVacationPlan(companyId) {
  const ref = planRef(companyId);
  if (!ref) return normalizeVacationPlan({});
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return normalizeVacationPlan({});
    return normalizeVacationPlan(snap.data() || {});
  } catch {
    return normalizeVacationPlan({});
  }
}

export async function saveVacationPlan(companyId, plan) {
  const ref = planRef(companyId);
  if (!ref) throw new Error('Mangler selskap.');
  const next = normalizeVacationPlan({ ...plan, companyId: String(companyId) });
  const payload = JSON.parse(JSON.stringify(next));
  await setDoc(ref, payload);
  return next;
}

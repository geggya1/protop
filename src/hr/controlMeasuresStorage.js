/**
 * Kontrolltiltak: families/{companyId}/hr/controlMeasures
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeControlMeasures } from './controlMeasures.js';

function ref(companyId) {
  const id = String(companyId || '').trim();
  return id ? doc(db, 'families', id, 'hr', 'controlMeasures') : null;
}

export async function loadControlMeasures(companyId) {
  const target = ref(companyId);
  if (!target) return normalizeControlMeasures({});
  try {
    const snap = await getDoc(target);
    return normalizeControlMeasures(snap.exists() ? snap.data() : {});
  } catch {
    return normalizeControlMeasures({});
  }
}

export async function saveControlMeasures(companyId, settings) {
  const target = ref(companyId);
  if (!target) throw new Error('Mangler selskap.');
  const next = normalizeControlMeasures({ ...settings, updatedAt: new Date().toISOString() });
  await setDoc(target, JSON.parse(JSON.stringify({ ...next, updatedAt: new Date().toISOString() })));
  return next;
}

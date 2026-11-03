/**
 * Sykefravær i Firestore.
 * - families/{companyId}/hr/sickLeave: firmaets regler (egenmelding, påminnelser).
 * - families/{companyId}/sickCases/{id}: saker og vedtak om fratatt egenmelding.
 *   Egen regel i firestore.rules: bare den ansatte selv, eier og HR/leder kan lese.
 *   Ingen diagnose lagres, bare det arbeidsgiver trenger for lønn og oppfølging.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeSickCase, normalizeSickRules } from './sickLeave.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

function settingsRef(companyId) {
  const id = cid(companyId);
  return id ? doc(db, 'families', id, 'hr', 'sickLeave') : null;
}

function casesCol(companyId) {
  return collection(db, 'families', cid(companyId), 'sickCases');
}

export function sickCaseId() {
  return `syk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export async function loadSickRules(companyId) {
  const ref = settingsRef(companyId);
  if (!ref) return normalizeSickRules({});
  try {
    const snap = await getDoc(ref);
    return normalizeSickRules(snap.exists() ? snap.data() : {});
  } catch {
    return normalizeSickRules({});
  }
}

export async function saveSickRules(companyId, rules) {
  const ref = settingsRef(companyId);
  if (!ref) throw new Error('Mangler selskap.');
  // Vedtak om fratatt egenmelding er personopplysninger og ligger i sickCases, ikke her.
  const { denied, ...open } = normalizeSickRules(rules);
  await setDoc(ref, JSON.parse(JSON.stringify({ ...open, updatedAt: new Date().toISOString() })));
  return normalizeSickRules(open);
}

function fromSnap(snap) {
  const data = snap.data() || {};
  return { ...data, id: snap.id };
}

/**
 * Leser saker. Leder/HR leser alle, ansatte bare egne (spørringen må matche regelen).
 * Returnerer { cases, denials, error }.
 */
export async function loadSickCases(companyId, { uid = '', manager = false } = {}) {
  const id = cid(companyId);
  if (!id) return { cases: [], denials: [], error: '' };
  try {
    const q = manager ? casesCol(id) : query(casesCol(id), where('employeeUid', '==', String(uid || '-')));
    const snap = await getDocs(q);
    const rows = snap.docs.map(fromSnap);
    return {
      cases: rows.filter((row) => row.record !== 'denial').map(normalizeSickCase),
      denials: rows.filter((row) => row.record === 'denial'),
      error: '',
    };
  } catch (error) {
    return { cases: [], denials: [], error: String(error?.code || error?.message || 'Kunne ikke lese sykefravær.') };
  }
}

export async function saveSickCase(companyId, sickCase) {
  const id = cid(companyId);
  if (!id) throw new Error('Mangler selskap.');
  const row = normalizeSickCase({ ...sickCase, id: sickCase?.id || sickCaseId(), updatedAt: new Date().toISOString() });
  await setDoc(doc(db, 'families', id, 'sickCases', row.id), JSON.parse(JSON.stringify({ ...row, record: 'case' })));
  return row;
}

export async function removeSickCase(companyId, caseId) {
  const id = cid(companyId);
  if (!id || !caseId) return;
  await deleteDoc(doc(db, 'families', id, 'sickCases', String(caseId)));
}

/** Vedtak etter ftrl § 8-27. Den ansatte kan lese sitt eget vedtak. */
export async function saveSelfCertDenial(companyId, denial) {
  const id = cid(companyId);
  if (!id) throw new Error('Mangler selskap.');
  const row = {
    record: 'denial',
    employeeId: String(denial?.employeeId || ''),
    employeeUid: String(denial?.employeeUid || ''),
    employeeName: String(denial?.employeeName || ''),
    from: String(denial?.from || '').slice(0, 10),
    heardAt: String(denial?.heardAt || '').slice(0, 10),
    reason: String(denial?.reason || '').slice(0, 400),
    decidedBy: String(denial?.decidedBy || '').slice(0, 160),
    decidedByUid: String(denial?.decidedByUid || ''),
    updatedAt: new Date().toISOString(),
  };
  if (!row.employeeId || !row.from) throw new Error('Velg ansatt og dato.');
  const docId = `denial_${row.employeeId}`;
  await setDoc(doc(db, 'families', id, 'sickCases', docId), row);
  return { ...row, id: docId };
}

export async function removeSelfCertDenial(companyId, employeeId) {
  const id = cid(companyId);
  if (!id || !employeeId) return;
  await deleteDoc(doc(db, 'families', id, 'sickCases', `denial_${employeeId}`));
}

/** Slår sammen firmaregler og vedtak, slik regelmodulen forventer. */
export function rulesWithDenials(rules, denials = []) {
  return normalizeSickRules({ ...rules, denied: denials });
}

/**
 * Lønnsoppsummering: families/{companyId}/hr/payroll (innstillinger) og
 * families/{companyId}/hr/payroll/runs/{YYYY-MM} (månedens grunnlag).
 * Ligger under hr/, så bare eier, administrator og HR leser og skriver (firestore.rules, L-01).
 * Sending til regnskapsfører går gjennom serveren (payrollSend i functions/payrollSend.js).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { normalizePayrollRun, normalizePayrollSettings } from './payrollMail.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

function settingsRef(companyId) {
  const id = cid(companyId);
  return id ? doc(db, 'families', id, 'hr', 'payroll') : null;
}

function runRef(companyId, month) {
  const id = cid(companyId);
  const key = String(month || '').trim();
  return id && /^\d{4}-\d{2}$/.test(key) ? doc(db, 'families', id, 'hr', 'payroll', 'runs', key) : null;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function loadPayrollSettings(companyId) {
  const target = settingsRef(companyId);
  if (!target) return normalizePayrollSettings({});
  const snap = await getDoc(target);
  return normalizePayrollSettings(snap.exists() ? snap.data() : {});
}

export async function savePayrollSettings(companyId, settings) {
  const target = settingsRef(companyId);
  if (!target) throw new Error('Mangler selskap.');
  const next = normalizePayrollSettings({ ...settings, updatedAt: new Date().toISOString() });
  await setDoc(target, plain(next));
  return next;
}

export async function loadPayrollRun(companyId, month) {
  const target = runRef(companyId, month);
  if (!target) return normalizePayrollRun({}, month);
  const snap = await getDoc(target);
  return normalizePayrollRun(snap.exists() ? snap.data() : {}, month);
}

export async function savePayrollRun(companyId, month, run) {
  const target = runRef(companyId, month);
  if (!target) throw new Error('Mangler måned.');
  const next = normalizePayrollRun({ ...run, month, updatedAt: new Date().toISOString() }, month);
  await setDoc(target, plain(next));
  return next;
}

function friendly(err) {
  const msg = String(err?.message || '').replace(/^.*?:\s*/, '');
  return msg && !/internal/i.test(msg) ? msg : 'Fikk ikke kontakt med serveren. Prøv igjen.';
}

/** Send godkjent grunnlag til regnskapsfører. Svar: { ok, run } eller { ok: false, error }. */
export async function sendPayrollRun(companyId, month) {
  try {
    const call = httpsCallable(functions, 'payrollSend', { timeout: 60000 });
    const res = await call({ familyId: cid(companyId), month });
    return { ok: true, run: normalizePayrollRun(res.data?.run || {}, month) };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

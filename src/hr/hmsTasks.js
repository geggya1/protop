/**
 * Oppgaven «Forny HMS-kortet» i oppgavemodulen (families/{id}/parentTodos/hms_<ansatt-id>).
 * Regler og tidspunkt ligger i hmsReminder.js.
 */
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from '../utils/dates.js';
import { HMS_SOURCE, hmsRenewalTask, hmsTaskId } from './hmsReminder.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

async function log(companyId, taskId, text, { uid = '', name = '' } = {}) {
  try {
    await addDoc(collection(db, 'families', cid(companyId), 'parentTodos', taskId, 'log'), {
      text, uid: uid || null, name: name || 'HR', createdAt: serverTimestamp(),
    });
  } catch {
    // Oppgaven er lagret selv om aktivitetsloggen feiler.
  }
}

export async function loadHmsTasks(companyId) {
  if (!cid(companyId)) return [];
  try {
    const snap = await getDocs(query(collection(db, 'families', cid(companyId), 'parentTodos'), where('source', '==', HMS_SOURCE)));
    return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
  } catch (err) {
    console.warn('hms tasks load failed', err?.message || err);
    return [];
  }
}

/** Lag oppgaven til HR. Erstatter en oppgave for et tidligere kort. */
export async function createHmsTask(companyId, employee, card, { uid = '', name = '', now = new Date() } = {}) {
  const id = hmsTaskId(employee?.id);
  const task = hmsRenewalTask(employee, card, { uid, today: dateKey(now) });
  await setDoc(doc(db, 'families', cid(companyId), 'parentTodos', id), { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await log(companyId, id, `Oppgaven ble opprettet fordi HMS-kortet går ut ${card?.validTo || ''}`.trim(), { uid, name });
  return { ...task, id };
}

/** Lukk oppgaven når nytt kort er registrert. */
export async function closeHmsTask(companyId, task, { uid = '', name = '', now = new Date() } = {}) {
  if (!cid(companyId) || !task?.id) return false;
  try {
    await updateDoc(doc(db, 'families', cid(companyId), 'parentTodos', task.id), {
      done: true, completedDates: [dateKey(now)], updatedAt: serverTimestamp(),
    });
    await log(companyId, task.id, 'Lukket: nytt HMS-kort er registrert ✅', { uid, name });
    return true;
  } catch {
    return false;
  }
}

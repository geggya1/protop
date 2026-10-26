/**
 * Oppgaven «Legg inn pårørende» i oppgavemodulen (families/{id}/parentTodos/kin_<ansatt-id>).
 * Regler og tidspunkt ligger i kinReminder.js.
 */
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from '../utils/dates.js';
import { KIN_SOURCE, kinTask, kinTaskId } from './kinReminder.js';

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

export async function loadKinTasks(companyId) {
  if (!cid(companyId)) return [];
  try {
    const snap = await getDocs(query(collection(db, 'families', cid(companyId), 'parentTodos'), where('source', '==', KIN_SOURCE)));
    return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
  } catch (err) {
    console.warn('kin tasks load failed', err?.message || err);
    return [];
  }
}

/** Lag (eller åpne igjen) oppgaven til den ansatte. previous er den lukkede oppgaven. */
export async function createKinTask(companyId, employee, { uid = '', name = '', previous = null, now = new Date() } = {}) {
  const id = kinTaskId(employee?.id);
  const task = kinTask(employee, { uid, now, previous });
  await setDoc(doc(db, 'families', cid(companyId), 'parentTodos', id), { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await log(companyId, id, previous ? 'Åpnet igjen: pårørende mangler fortsatt' : 'Oppgaven ble opprettet fordi pårørende mangler på profilen', { uid, name });
  return { ...task, id };
}

/** Lukk oppgaven når pårørende er lagt inn. Gjør ingenting hvis oppgaven ikke finnes eller er lukket. */
export async function closeKinTask(companyId, employeeId, { uid = '', name = '', now = new Date() } = {}) {
  if (!cid(companyId) || !employeeId) return false;
  const id = kinTaskId(employeeId);
  try {
    const ref = doc(db, 'families', cid(companyId), 'parentTodos', id);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data()?.done === true) return false;
    await updateDoc(ref, { done: true, completedDates: [dateKey(now)], updatedAt: serverTimestamp() });
    await log(companyId, id, 'Lukket: pårørende er lagt inn på profilen ✅', { uid, name });
    return true;
  } catch {
    return false;
  }
}

export async function markKinReminded(companyId, task, { now = new Date() } = {}) {
  const reminders = (Number(task?.reminders) || 0) + 1;
  const remindedAt = dateKey(now);
  await updateDoc(doc(db, 'families', cid(companyId), 'parentTodos', task.id), { reminders, remindedAt, updatedAt: serverTimestamp() });
  return { ...task, reminders, remindedAt };
}

/**
 * Oppgaver fra HR-årshjulet og fristene ved sykefravær i oppgavemodulen
 * (families/{id}/parentTodos). Reglene ligger i annualWheel.js og sickLeave.js.
 */
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from '../utils/dates.js';
import { HR_ANNUAL_SOURCE } from './annualWheel.js';
import { SICK_SOURCE, sickTask } from './sickLeave.js';

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

async function loadBySource(companyId, source) {
  if (!cid(companyId)) return [];
  try {
    const snap = await getDocs(query(collection(db, 'families', cid(companyId), 'parentTodos'), where('source', '==', source)));
    return snap.docs.map((row) => ({ ...row.data(), id: row.id }));
  } catch (err) {
    console.warn('hr deadline tasks load failed', source, err?.message || err);
    return null;
  }
}

/** null når lesingen feilet (da lages ingenting, så det ikke blir dobbelt). */
export function loadAnnualTasks(companyId) {
  return loadBySource(companyId, HR_ANNUAL_SOURCE);
}

export function loadSickTasks(companyId) {
  return loadBySource(companyId, SICK_SOURCE);
}

/** Åpne igjen en oppgave som ble lukket som utdatert, når fristen likevel gjelder. */
export async function reopenHrDeadlineTask(companyId, task, { uid = '', name = '' } = {}) {
  if (!cid(companyId) || !task?.id) return false;
  try {
    await updateDoc(doc(db, 'families', cid(companyId), 'parentTodos', task.id), {
      done: false, completedDates: [], closedReason: null, updatedAt: serverTimestamp(),
    });
    await log(companyId, task.id, 'Åpnet igjen: fristen gjelder fortsatt', { uid, name });
    return true;
  } catch {
    return false;
  }
}

/** task er ferdig bygget av annualTaskPlan (med id). */
export async function createAnnualTask(companyId, task, who = {}) {
  const { id, ...data } = task;
  await setDoc(doc(db, 'families', cid(companyId), 'parentTodos', id), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await log(companyId, id, 'Oppgaven ble opprettet fra HR-årshjulet', who);
  return task;
}

export async function createSickTask(companyId, id, milestone, { uid = '', name = '', now = new Date() } = {}) {
  const task = sickTask(milestone, { uid, today: now });
  await setDoc(doc(db, 'families', cid(companyId), 'parentTodos', id), { ...task, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await log(companyId, id, 'Oppgaven ble opprettet fordi en frist ved sykefravær nærmer seg', { uid, name });
  return { ...task, id };
}

export async function closeHrDeadlineTask(companyId, task, reason, { uid = '', name = '', now = new Date(), closedReason = 'done' } = {}) {
  if (!cid(companyId) || !task?.id) return false;
  try {
    await updateDoc(doc(db, 'families', cid(companyId), 'parentTodos', task.id), {
      done: true, completedDates: [dateKey(now)], closedReason, updatedAt: serverTimestamp(),
    });
    await log(companyId, task.id, reason, { uid, name });
    return true;
  } catch {
    return false;
  }
}

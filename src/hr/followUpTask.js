/**
 * Skriver HR-planlegging inn i oppgavemodulen (parentTodos).
 * Saken beholder taskId så oppfølging kan peke tilbake.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from '../utils/dates.js';
import { followUpParentTodo } from './model.js';

export async function createFollowUpTask({
  familyId, uid, name, draft,
} = {}) {
  const actor = String(uid || '').trim();
  if (!familyId || !actor || !String(draft?.title || '').trim()) return '';
  const todo = followUpParentTodo(draft, {
    uid: actor,
    startKey: dateKey(new Date()),
  });
  const payload = {
    ...todo,
    id: undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  delete payload.id;
  const ref = await addDoc(collection(db, 'families', familyId, 'parentTodos'), payload);
  try {
    await addDoc(collection(db, 'families', familyId, 'parentTodos', ref.id, 'log'), {
      text: 'Oppgaven ble opprettet fra HR-oppfølging',
      uid: actor,
      name: name || 'HR',
      createdAt: serverTimestamp(),
    });
  } catch {
    // Oppgaven er lagret selv om aktivitetsloggen feiler.
  }
  return ref.id;
}

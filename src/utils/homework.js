import {
  addDoc, arrayRemove, arrayUnion, collection, doc, onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from './dates.js';
import { isHomeworkDone, mapHomework } from './homeworkModel.js';

export {
  HOMEWORK_SUBJECTS,
  canAdultEditHomework,
  canCreateHomework,
  groupHomeworkBySubject,
  formatHomeworkDue,
  homeworkFromLegacyTodo,
  homeworkHelpPrompt,
  homeworkInWeek,
  inferSubjectId,
  resolveHomeworkSubjectId,
  isHomeworkDone,
  mapHomework,
  mergeLekserForWeek,
  subjectLabel,
  subjectMeta,
  weekBoundsKeys,
} from './homeworkModel.js';

export function listenChildHomework(familyId, childId, onChange) {
  if (!familyId || !childId) return () => {};
  const ref = collection(db, 'families', familyId, 'children', childId, 'homework');
  return onSnapshot(ref, (snap) => {
    const items = snap.docs.map((d) => mapHomework(d.id, d.data())).filter((h) => !h.deleted && h.active);
    onChange(items);
  }, () => onChange([]));
}

export async function saveHomework(familyId, childId, payload, { homeworkId } = {}) {
  if (!familyId || !childId) throw new Error('missing-ids');
  const body = {
    title: String(payload.title || '').trim() || 'Lekse',
    description: String(payload.description || '').trim(),
    subject: payload.subject || 'annet',
    dueDate: payload.dueDate || null,
    startKey: payload.startKey || null,
    assignedTo: payload.assignedTo || childId,
    assignedToName: payload.assignedToName || null,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    done: payload.done === true,
    completedDates: Array.isArray(payload.completedDates) ? payload.completedDates : [],
    active: true,
    deleted: false,
    source: payload.source || 'manual',
    childId,
    sourceTodoId: payload.sourceTodoId || null,
    updatedAt: serverTimestamp(),
  };
  if (homeworkId) {
    await updateDoc(doc(db, 'families', familyId, 'children', childId, 'homework', homeworkId), body);
    return homeworkId;
  }
  body.createdAt = serverTimestamp();
  body.createdBy = payload.createdBy || null;
  const ref = await addDoc(collection(db, 'families', familyId, 'children', childId, 'homework'), body);
  return ref.id;
}

export async function toggleHomework(familyId, childId, item, date = new Date()) {
  if (!familyId || !childId || !item?.id) throw new Error('missing-ids');
  const k = typeof date === 'string' ? date : dateKey(date);
  const ref = doc(db, 'families', familyId, 'children', childId, 'homework', item.id);
  const done = isHomeworkDone(item, k);
  if (done) {
    await updateDoc(ref, {
      done: false,
      completedDates: arrayRemove(k),
    });
    return false;
  }
  await updateDoc(ref, {
    done: true,
    completedDates: arrayUnion(k),
  });
  return true;
}

export async function deleteHomework(familyId, childId, homeworkId) {
  if (!familyId || !childId || !homeworkId) {
    throw new Error('Mangler familie, barn eller lekse-id for sletting.');
  }
  await updateDoc(doc(db, 'families', familyId, 'children', childId, 'homework', homeworkId), {
    deleted: true,
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function markLegacyTodoMigrated(familyId, childId, todoId, homeworkId) {
  if (!familyId || !childId || !todoId) return;
  await updateDoc(doc(db, 'families', familyId, 'children', childId, 'todos', todoId), {
    deleted: true,
    migratedToHomeworkId: homeworkId || true,
    updatedAt: serverTimestamp(),
  });
}

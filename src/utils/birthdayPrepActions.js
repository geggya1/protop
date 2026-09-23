/**
 * Sideeffekter for bursdagsforberedelser: varsler, oppgaver, ønskeliste.
 */

import {
  addDoc, collection, doc, getDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { dateKey } from './dates.js';
import { toIsoDate } from './age.js';
import { notifyUsers } from './notifications.js';
import { ensureChildWishlist, createWishlist } from './wishlists.js';
import {
  adultUidsFromMembers,
  buildBirthdayPrepNotificationPayload,
  prepTaskTitlesForMember,
} from './birthdayPrepReminder.js';

async function ensureNotificationDoc(toUid, notificationId, payload) {
  const ref = doc(db, 'users', toUid, 'notifications', String(notificationId));
  const snap = await getDoc(ref);
  if (snap.exists()) return false;
  await setDoc(ref, payload);
  return true;
}

/** Skriv stabile inbox-varsler til alle voksne (én gang per barn/år). */
export async function ensureBirthdayPrepNotifications({
  familyId,
  members,
  item,
  now = new Date(),
} = {}) {
  const payload = buildBirthdayPrepNotificationPayload({ familyId, item, now });
  if (!payload?.notificationId || !familyId) return { notified: 0 };
  const adults = adultUidsFromMembers(members);
  if (!adults.length) return { notified: 0 };

  const docPayload = {
    eventType: payload.eventType,
    title: payload.title,
    body: payload.body,
    familyId: payload.familyId,
    childId: payload.childId || null,
    memberId: payload.memberId || null,
    dateKey: payload.dateKey || null,
    createdAt: serverTimestamp(),
    seen: false,
    createdBy: null,
  };

  const results = await Promise.allSettled(
    adults.map((toUid) => ensureNotificationDoc(toUid, payload.notificationId, docPayload)),
  );
  const notified = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
  return { notified, notificationId: payload.notificationId };
}

export async function createParentPrepTask({
  familyId,
  uid,
  title,
  description = '',
  deadline = null,
  members = [],
} = {}) {
  if (!familyId || !uid || !String(title || '').trim()) return null;
  const payload = {
    title: String(title).trim(),
    description: String(description || '').trim(),
    deadline: deadline || null,
    deadlineTime: null,
    participants: [],
    assignedTo: null,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    startKey: dateKey(new Date()),
    order: 0,
  };
  const ref = await addDoc(collection(db, 'families', familyId, 'parentTodos'), payload);
  const recipients = (members || [])
    .filter((m) => m?.role === 'parent')
    .map((m) => m.uid || m.id)
    .filter((id) => id && id !== uid);
  if (recipients.length) {
    notifyUsers(recipients, {
      eventType: 'taskReceived',
      title: 'Ny oppgave',
      body: payload.title,
      familyId,
      createdBy: uid,
    }).catch(() => {});
  }
  return ref.id;
}

export async function createAllPrepTasks({
  familyId, uid, item, members = [],
} = {}) {
  const titles = prepTaskTitlesForMember(item);
  const deadline = item?.nextDate ? toIsoDate(item.nextDate) : null;
  const ids = [];
  for (const title of titles) {
    // eslint-disable-next-line no-await-in-loop
    const id = await createParentPrepTask({
      familyId,
      uid,
      title,
      deadline,
      members,
      description: `Forberedelse til ${item?.memberName || 'bursdag'}`,
    });
    if (id) ids.push(id);
  }
  return ids;
}

/** Finn eller opprett ønskeliste knyttet til bursdagen. */
export async function ensureBirthdayWishlist({
  familyId,
  uid,
  creatorName,
  item,
  members = [],
} = {}) {
  if (!familyId || !uid || !item) return null;
  const occasionDate = item.nextDate ? toIsoDate(item.nextDate) : null;
  const name = firstNameSafe(item.memberName);

  if (item.role === 'child' && item.memberId) {
    const listId = await ensureChildWishlist(familyId, {
      uid,
      creatorName,
      childId: item.memberId,
      childName: item.memberName,
      subjectUid: item.memberUid || null,
      members,
    });
    return listId;
  }

  const ref = await createWishlist(familyId, {
    uid,
    creatorName,
    name: `${name}s bursdag`,
    forMemberUid: item.memberUid || null,
    forMemberName: item.memberName || null,
    occasionDate,
    members,
  });
  return ref?.id || null;
}

function firstNameSafe(name) {
  const raw = String(name || '').trim();
  return raw ? raw.split(/\s+/)[0] : 'Bursdag';
}

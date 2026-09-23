/**
 * Felles plattformlogikk for vennegjeng, forsamlings, barnehage og gruppe.
 * Bygger på families-dokumenter med type-spesifikke subcollections.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isGroupAdmin } from '../utils/groups';
import {
  isFriendsType, isCongregationType, isDaycareType, isFlexGroupType,
  platformTypesForFilter,
} from '../utils/groupTypes';

import {
  generateSecureJoinCode,
  normalizeJoinCode as normalizeSecureJoinCode,
} from '../utils/secureJoinCode';
import { submitJoinRequestByCode as submitJoinRequestCallable } from '../utils/joinRequests';

export function generateJoinCode(length = 8) {
  return generateSecureJoinCode(length);
}

export function normalizeJoinCode(code) {
  return normalizeSecureJoinCode(code);
}

async function ensureUniqueJoinCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateJoinCode(8);
    const snap = await getDoc(doc(db, 'joinCodes', code));
    if (!snap.exists()) return code;
  }
  return generateJoinCode(10);
}

export function isPlatformType(type, platformType) {
  const t = String(type || '').toLowerCase();
  const p = String(platformType || '').toLowerCase();
  if (p === 'friends') return isFriendsType(t);
  if (p === 'congregation') return isCongregationType(t);
  if (p === 'daycare') return isDaycareType(t);
  if (p === 'group') return isFlexGroupType(t);
  return false;
}

/** Legg til join-kode på plattform ved opprettelse. */
export async function ensurePlatformJoinCode(groupId) {
  const snap = await getDoc(doc(db, 'families', groupId));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  if (data.joinCode) {
    // Keep mapping in sync — never store group name/PII on the public index.
    await setDoc(doc(db, 'joinCodes', data.joinCode), {
      code: data.joinCode,
      familyId: groupId,
      type: data.type || null,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return data.joinCode;
  }
  const joinCode = await ensureUniqueJoinCode();
  await updateDoc(doc(db, 'families', groupId), {
    joinCode,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'joinCodes', joinCode), {
    code: joinCode,
    familyId: groupId,
    type: data.type || null,
    updatedAt: serverTimestamp(),
  });
  return joinCode;
}

export async function findPlatformByJoinCode(rawCode, platformType) {
  const joinCode = normalizeJoinCode(rawCode);
  if (joinCode.length < 6) throw new Error('Ugyldig kode.');
  const types = platformTypesForFilter(platformType);
  const mapSnap = await getDoc(doc(db, 'joinCodes', joinCode));
  if (!mapSnap.exists()) throw new Error('Fant ingen gruppe med denne koden.');
  const mapped = mapSnap.data() || {};
  const familyId = mapped.familyId;
  if (!familyId) throw new Error('Fant ingen gruppe med denne koden.');

  // Prefer minimal public fields from joinCodes; enrich from family if caller is/becomes member.
  let group = {
    id: familyId,
    name: '',
    type: mapped.type || '',
    joinCode,
  };
  try {
    const famSnap = await getDoc(doc(db, 'families', familyId));
    if (famSnap.exists()) {
      group = { id: famSnap.id, ...famSnap.data() };
    }
  } catch {
    // Not a member yet — return minimal join mapping only.
  }
  if (group.deleted === true || group.hiddenFromApp === true || group.active === false) {
    throw new Error('Fant ingen gruppe med denne koden.');
  }
  if (!types.includes(String(group.type || '').toLowerCase())) {
    throw new Error('Fant ingen gruppe med denne koden.');
  }
  return group;
}

export async function listUserPlatforms(uid, platformType) {
  if (!uid) return [];
  const types = platformTypesForFilter(platformType);
  const [mSnap, aSnap, oSnap] = await Promise.all([
    getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
  ]);
  const map = new Map();
  [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => {
    const data = d.data() || {};
    if (types.includes(String(data.type || '').toLowerCase()) && data.deleted !== true) {
      map.set(d.id, { id: d.id, ...data });
    }
  });
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/** ——— Innlegg / vegg / strøm ——— */
function normalizePostImageUrls(imageUrls, imageUrl) {
  const urls = Array.isArray(imageUrls)
    ? imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const single = String(imageUrl || '').trim();
  if (single && !urls.includes(single)) urls.unshift(single);
  return urls.slice(0, 8);
}

export async function createPlatformPost({
  groupId, authorUid, authorName, title, body, imageUrl, imageUrls, category,
}) {
  const urls = normalizePostImageUrls(imageUrls, imageUrl);
  const text = String(body || '').trim();
  if (!text && urls.length === 0) throw new Error('Skriv noe, eller legg ved bilde.');
  const ref = await addDoc(collection(db, 'families', groupId, 'posts'), {
    title: String(title || '').trim() || null,
    body: text,
    category: category || null,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    authorUid,
    authorName: authorName || 'Ukjent',
    reactionCount: 0,
    reactions: {},
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function listenPlatformPosts(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function reactToPlatformPost(groupId, postId, uid, emoji = '👍') {
  const ref = doc(db, 'families', groupId, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const reactions = { ...(data.reactions || {}) };
  if (reactions[uid] === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await updateDoc(ref, {
    reactions,
    reactionCount: Object.keys(reactions).length,
    updatedAt: serverTimestamp(),
  });
}

export function listenPlatformPostComments(groupId, postId, cb) {
  if (!groupId || !postId) {
    cb([]);
    return () => {};
  }
  const qy = query(
    collection(db, 'families', groupId, 'posts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function addPlatformPostComment({
  groupId, postId, authorUid, authorName, body,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Skriv en kommentar.');
  const postRef = doc(db, 'families', groupId, 'posts', postId);
  await addDoc(collection(postRef, 'comments'), {
    body: text,
    authorUid,
    authorName: authorName || 'Ukjent',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(postRef);
  const count = Number(snap.data()?.commentCount || 0) + 1;
  await updateDoc(postRef, { commentCount: count, updatedAt: serverTimestamp() });
}

/** ——— Hendelser / planer med RSVP ——— */
export function listenPlatformEvents(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'events'),
    orderBy('dateKey', 'asc'),
    limit(80,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createPlatformEvent({
  groupId, title, dateKey, startTime, endTime, location, description,
  authorUid, authorName, eventType, rsvpEnabled = true,
}) {
  if (!title?.trim() || !dateKey) throw new Error('Tittel og dato kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'events'), {
    title: title.trim(),
    dateKey,
    startTime: startTime || null,
    endTime: endTime || null,
    location: location || null,
    description: description || null,
    eventType: eventType || 'plan',
    rsvpEnabled: rsvpEnabled !== false,
    rsvp: { going: [], maybe: [], no: [] },
    authorUid,
    authorName: authorName || 'Ukjent',
    source: 'platform',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function setEventRsvp(groupId, eventId, uid, status) {
  const ref = doc(db, 'families', groupId, 'events', eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Fant ikke hendelsen.');
  const data = snap.data() || {};
  const rsvp = {
    going: [...(data.rsvp?.going || [])].filter((id) => id !== uid),
    maybe: [...(data.rsvp?.maybe || [])].filter((id) => id !== uid),
    no: [...(data.rsvp?.no || [])].filter((id) => id !== uid),
  };
  if (status === 'going') rsvp.going.push(uid);
  else if (status === 'maybe') rsvp.maybe.push(uid);
  else if (status === 'no') rsvp.no.push(uid);
  await updateDoc(ref, { rsvp, updatedAt: serverTimestamp() });
}

/** ——— Vennegjeng: utgifter ——— */
export function listenPlatformExpenses(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'expenses'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createPlatformExpense({
  groupId, title, amount, paidByUid, paidByName, splitAmong = [], authorUid,
}) {
  const amt = Number(amount);
  if (!title?.trim() || !amt || amt <= 0) throw new Error('Tittel og beløp kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'expenses'), {
    title: title.trim(),
    amount: amt,
    currency: 'NOK',
    paidByUid,
    paidByName: paidByName || 'Ukjent',
    splitAmong: splitAmong.length ? splitAmong : [paidByUid],
    settled: false,
    authorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Vennegjeng: avstemninger ——— */
export function listenPlatformPolls(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'polls'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createPlatformPoll({
  groupId, question, options, authorUid, authorName, closesAt,
}) {
  const opts = (options || []).map((o) => String(o || '').trim()).filter(Boolean);
  if (!question?.trim() || opts.length < 2) throw new Error('Spørsmål og minst to alternativer kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'polls'), {
    question: question.trim(),
    options: opts.map((label) => ({ label, votes: [] })),
    authorUid,
    authorName: authorName || 'Ukjent',
    closesAt: closesAt || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function votePlatformPoll(groupId, pollId, optionIndex, uid) {
  const ref = doc(db, 'families', groupId, 'polls', pollId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Fant ikke avstemningen.');
  const data = snap.data() || {};
  const options = (data.options || []).map((o) => ({
    ...o,
    votes: [...(o.votes || [])].filter((id) => id !== uid),
  }));
  if (optionIndex >= 0 && optionIndex < options.length) {
    options[optionIndex].votes.push(uid);
  }
  await updateDoc(ref, { options, updatedAt: serverTimestamp() });
}

/** ——— Forsamling: menighetsgrupper ——— */
export function listenMinistryGroups(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'ministryGroups'),
    orderBy('name', 'asc'),
    limit(30),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createMinistryGroup({
  groupId, name, description, leaderName, meetingDay,
}) {
  if (!name?.trim()) throw new Error('Navn kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'ministryGroups'), {
    name: name.trim(),
    description: description || null,
    leaderName: leaderName || null,
    meetingDay: meetingDay || null,
    memberCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Forsamling: frivillig tjeneste ——— */
export function listenVolunteerSlots(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'volunteerSlots'),
    orderBy('dateKey', 'asc'),
    limit(40),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createVolunteerSlot({
  groupId, title, dateKey, startTime, spots, description, authorUid,
}) {
  if (!title?.trim() || !dateKey) throw new Error('Tittel og dato kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'volunteerSlots'), {
    title: title.trim(),
    dateKey,
    startTime: startTime || null,
    spots: Number(spots) || 1,
    signedUp: [],
    description: description || null,
    authorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function signUpVolunteerSlot(groupId, slotId, uid, name) {
  const ref = doc(db, 'families', groupId, 'volunteerSlots', slotId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Fant ikke tjenesten.');
  const data = snap.data() || {};
  const signedUp = [...(data.signedUp || [])];
  const idx = signedUp.findIndex((s) => s.uid === uid);
  if (idx >= 0) {
    signedUp.splice(idx, 1);
  } else {
    if (signedUp.length >= (data.spots || 1)) throw new Error('Alle plassene er tatt.');
    signedUp.push({ uid, name: name || 'Medlem', at: Date.now() });
  }
  await updateDoc(ref, { signedUp, updatedAt: serverTimestamp() });
}

/** ——— Barnehage: dagsrytme ——— */
export function listenDailyRhythm(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'dailyRhythm'),
    orderBy('sortOrder', 'asc'),
    limit(20,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function upsertRhythmSlot(groupId, slotId, { time, label, description, sortOrder }) {
  const payload = {
    time: time || null,
    label: String(label || '').trim(),
    description: description || null,
    sortOrder: Number(sortOrder) || 0,
    updatedAt: serverTimestamp(),
  };
  if (slotId) {
    await updateDoc(doc(db, 'families', groupId, 'dailyRhythm', slotId), payload);
    return slotId;
  }
  const ref = await addDoc(collection(db, 'families', groupId, 'dailyRhythm'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Barnehage: fravær ——— */
export function listenAbsences(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'absences'),
    orderBy('dateKey', 'desc'),
    limit(30,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function reportAbsence({
  groupId, childId, childName, dateKey, reason, authorUid, authorName,
}) {
  if (!childName?.trim() || !dateKey) throw new Error('Barn og dato kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'absences'), {
    childId: childId || null,
    childName: childName.trim(),
    dateKey,
    reason: reason || null,
    status: 'pending',
    authorUid,
    authorName: authorName || 'Foresatt',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Barnehage: henting ——— */
export function listenPickupPlans(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'pickupPlans'),
    orderBy('dateKey', 'desc'),
    limit(20,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createPickupPlan({
  groupId, childId, childName, dateKey, pickupTime, pickupBy, pickupPhone, notes, authorUid,
}) {
  if (!childName?.trim() || !dateKey) throw new Error('Barn og dato kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'pickupPlans'), {
    childId: childId || null,
    childName: childName.trim(),
    dateKey,
    pickupTime: pickupTime || null,
    pickupBy: pickupBy || null,
    pickupPhone: pickupPhone || null,
    notes: notes || null,
    authorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Barnehage: beskjeder til foresatte ——— */
export function listenDaycareAnnouncements(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'announcements'),
    orderBy('createdAt', 'desc'),
    limit(30,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createDaycareAnnouncement({
  groupId, title, body, authorUid, authorName, priority,
}) {
  if (!title?.trim() || !body?.trim()) throw new Error('Tittel og tekst kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'announcements'), {
    title: title.trim(),
    body: body.trim(),
    priority: priority || 'normal',
    authorUid,
    authorName: authorName || 'Ansatt',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** ——— Gruppe: felles oppgaver ——— */
export function listenGroupTasks(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'groupTasks'),
    orderBy('createdAt', 'desc'),
    limit(50,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createGroupTask({
  groupId, title, assigneeUid, assigneeName, dueDateKey, authorUid,
}) {
  if (!title?.trim()) throw new Error('Tittel kreves.');
  const ref = await addDoc(collection(db, 'families', groupId, 'groupTasks'), {
    title: title.trim(),
    done: false,
    assigneeUid: assigneeUid || null,
    assigneeName: assigneeName || null,
    dueDateKey: dueDateKey || null,
    authorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function toggleGroupTask(groupId, taskId, done) {
  await updateDoc(doc(db, 'families', groupId, 'groupTasks', taskId), {
    done: !!done,
    updatedAt: serverTimestamp(),
  });
}

/** ——— Bli med forespørsel ——— */
export async function submitPlatformJoinRequest({
  joinCode, platformType, parentUid, parentName, parentEmail, displayName,
}) {
  if (!parentUid) throw new Error('Du må være innlogget.');
  const res = await submitJoinRequestCallable({
    code: joinCode,
    kind: 'member',
    parentName: parentName || displayName || '',
    parentEmail: (parentEmail || '').toLowerCase(),
    message: platformType ? `platform:${platformType}` : '',
  });
  return {
    requestId: res.requestId,
    groupId: res.familyId,
    groupName: res.familyName,
    type: res.type,
  };
}

export function listenPlatformJoinRequests(groupId, cb) {
  const qy = query(
    collection(db, 'families', groupId, 'joinRequests'),
    orderBy('createdAt', 'desc'),
    limit(50,
    ),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function approvePlatformJoinRequest(groupId, requestId, adminUid) {
  const reqRef = doc(db, 'families', groupId, 'joinRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Fant ikke forespørselen.');
  const req = reqSnap.data() || {};
  if (req.status !== 'pending') throw new Error('Forespørselen er allerede behandlet.');

  const groupRef = doc(db, 'families', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('Fant ikke gruppen.');
  const group = groupSnap.data() || {};
  if (!isGroupAdmin({ ...group, id: groupId }, adminUid)) {
    throw new Error('Kun administrator kan godkjenne.');
  }

  const parentUid = req.parentUid;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(groupRef, {
    members: arrayUnion(parentUid),
    updatedAt: now,
  });

  const parentPayload = {
    uid: parentUid,
    email: req.parentEmail || '',
    name: req.parentName || 'Medlem',
    admin: false,
    active: true,
    archived: false,
    placeholder: false,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(doc(db, 'families', groupId, 'parents', parentUid), parentPayload, { merge: true });
  batch.set(doc(db, 'parents', parentUid), {
    familyIds: arrayUnion(groupId),
    updatedAt: now,
  }, { merge: true });

  batch.update(reqRef, {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
    updatedAt: now,
  });

  await batch.commit();
  return { parentUid };
}

export async function rejectPlatformJoinRequest(groupId, requestId, adminUid) {
  await updateDoc(doc(db, 'families', groupId, 'joinRequests', requestId), {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** ——— Demo-innhold ved opprettelse ——— */
export async function seedPlatformContent(groupId, platformType, authorUid, authorName) {
  const type = String(platformType || '').toLowerCase();
  const today = new Date();
  const dateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const weekend = new Date(today);
  weekend.setDate(weekend.getDate() + ((6 - weekend.getDay()) || 7));

  const batch = writeBatch(db);
  const now = serverTimestamp();

  if (isFriendsType(type)) {
    batch.set(doc(collection(db, 'families', groupId, 'posts')), {
      title: 'Velkommen til gjengen!',
      body: 'Her planlegger vi treff, turer og felles gjøremål. Legg inn neste plan under «Planer», stem på tid i «Avstemning», og del utgifter etter hyttetur.',
      authorUid, authorName: authorName || 'Admin',
      reactionCount: 0, reactions: {}, commentCount: 0,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'events')), {
      title: 'Første felles treff',
      dateKey: dateKey(weekend),
      startTime: '18:00',
      location: 'TBD — stem i avstemning!',
      description: 'Kom med forslag til sted og tid.',
      eventType: 'hangout',
      rsvpEnabled: true,
      rsvp: { going: authorUid ? [authorUid] : [], maybe: [], no: [] },
      authorUid, authorName: authorName || 'Admin',
      source: 'platform', createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'polls')), {
      question: 'Når passer det best for neste treff?',
      options: [
        { label: 'Fredag kveld', votes: [] },
        { label: 'Lørdag formiddag', votes: [] },
        { label: 'Søndag ettermiddag', votes: [] },
      ],
      authorUid, authorName: authorName || 'Admin',
      createdAt: now, updatedAt: now,
    });
  }

  if (isCongregationType(type)) {
    batch.set(doc(collection(db, 'families', groupId, 'posts')), {
      title: 'Velkommen i menigheten',
      body: 'Her finner du samlinger, grupper og praktisk info. Sjekk kalenderen for gudstjenester og meld deg på frivillig tjeneste.',
      category: 'info',
      authorUid, authorName: authorName || 'Admin',
      reactionCount: 0, reactions: {}, commentCount: 0,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'events')), {
      title: 'Gudstjeneste søndag',
      dateKey: dateKey(weekend),
      startTime: '11:00',
      location: 'Menighetshuset',
      description: 'Fellesskap, sang og undervisning. Velkommen!',
      eventType: 'service',
      rsvpEnabled: false,
      authorUid, authorName: authorName || 'Admin',
      source: 'platform', createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'ministryGroups')), {
      name: 'Ungdom', description: 'Ungdomsgruppe — aktiviteter og fellesskap.',
      leaderName: null, meetingDay: 'Onsdag', memberCount: 0,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'ministryGroups')), {
      name: 'Kor', description: 'Kormøter og gudstjenestemusikk.',
      leaderName: null, meetingDay: 'Torsdag', memberCount: 0,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'volunteerSlots')), {
      title: 'Vertskap søndag',
      dateKey: dateKey(weekend),
      startTime: '10:30',
      spots: 4,
      signedUp: [],
      description: 'Kaffe, velkomst og oppsyn.',
      authorUid,
      createdAt: now, updatedAt: now,
    });
  }

  if (isDaycareType(type)) {
    const rhythm = [
      { time: '07:30', label: 'Ankomst og frilek', sortOrder: 1 },
      { time: '09:00', label: 'Frokost', sortOrder: 2 },
      { time: '10:00', label: 'Utetur / aktivitet', sortOrder: 3 },
      { time: '11:30', label: 'Lunsj', sortOrder: 4 },
      { time: '12:00', label: 'Hvile / rolig aktivitet', sortOrder: 5 },
      { time: '14:30', label: 'Ettermiddagsmat', sortOrder: 6 },
      { time: '16:00', label: 'Henting', sortOrder: 7 },
    ];
    rhythm.forEach((slot) => {
      batch.set(doc(collection(db, 'families', groupId, 'dailyRhythm')), {
        ...slot,
        description: null,
        createdAt: now, updatedAt: now,
      });
    });
    batch.set(doc(collection(db, 'families', groupId, 'announcements')), {
      title: 'Velkommen til barnehagen!',
      body: 'Her finner du dagsrytme, beskjeder og mulighet for å melde fravær og henting. Ta kontakt ved spørsmål.',
      priority: 'normal',
      authorUid, authorName: authorName || 'Ansatt',
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'announcements')), {
      title: 'Ukeplan uke ' + Math.ceil((today.getDate()) / 7),
      body: 'Denne uken fokuserer vi på natur og utelek. Husk ekstra klær og regntøy!',
      priority: 'normal',
      authorUid, authorName: authorName || 'Ansatt',
      createdAt: now, updatedAt: now,
    });
  }

  if (isFlexGroupType(type)) {
    batch.set(doc(collection(db, 'families', groupId, 'posts')), {
      title: 'Gruppen er klar',
      body: 'En fleksibel plattform for det som passer dere — planer, oppgaver og prat samlet.',
      authorUid, authorName: authorName || 'Admin',
      reactionCount: 0, reactions: {}, commentCount: 0,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'events')), {
      title: 'Første møte',
      dateKey: dateKey(nextWeek),
      startTime: '17:00',
      location: 'Digitalt eller fysisk — avklares i chat',
      eventType: 'meeting',
      rsvpEnabled: true,
      rsvp: { going: [], maybe: [], no: [] },
      authorUid, authorName: authorName || 'Admin',
      source: 'platform', createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'groupTasks')), {
      title: 'Inviter medlemmer med gruppekode',
      done: false,
      assigneeUid: authorUid,
      assigneeName: authorName || 'Admin',
      dueDateKey: dateKey(nextWeek),
      authorUid,
      createdAt: now, updatedAt: now,
    });
    batch.set(doc(collection(db, 'families', groupId, 'groupTasks')), {
      title: 'Avklar møtefrekvens',
      done: false,
      assigneeUid: null,
      assigneeName: null,
      dueDateKey: null,
      authorUid,
      createdAt: now, updatedAt: now,
    });
  }

  await batch.commit();
  await ensurePlatformJoinCode(groupId);
}

export async function setupNewPlatform(groupId, platformType, authorUid, authorName) {
  await ensurePlatformJoinCode(groupId);
  try {
    await seedPlatformContent(groupId, platformType, authorUid, authorName);
  } catch {
    /* seed er best-effort */
  }
}

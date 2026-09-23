/**
 * Idrettslag / lag — separat fra familiesiden.
 * Bruker families-dokumenter med type team|club, pluss join-kode og forespørsler.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, query, where,
  serverTimestamp, arrayUnion, writeBatch, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { createGroup, isGroupAdmin } from './groups';
import { generateSecureJoinCode, normalizeJoinCode as normalizeSecureJoinCode } from './secureJoinCode';
import { submitJoinRequestByCode as submitJoinRequestCallable } from './joinRequests';
import { TEAM_TYPES, isTeamType, isFamilyType } from './groupTypes';

export { TEAM_TYPES, isTeamType, isFamilyType };

export function generateJoinCode(length = 8) {
  return generateSecureJoinCode(length);
}

export function normalizeJoinCode(code) {
  return normalizeSecureJoinCode(code);
}

async function ensureUniqueJoinCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateJoinCode(8);
    const mapSnap = await getDoc(doc(db, 'joinCodes', code));
    if (!mapSnap.exists()) return code;
  }
  return generateJoinCode(10);
}

/** Opprett idrettslag med unik join-kode. */
export async function createTeam({ name, sport, user, profile, language }) {
  const familyId = await createGroup({
    name: String(name || '').trim() || 'Mitt lag',
    type: 'team',
    language,
    user,
    profile,
  });
  const joinCode = await ensureUniqueJoinCode();
  await updateDoc(doc(db, 'families', familyId), {
    joinCode,
    sport: String(sport || '').trim() || null,
    teamMode: true,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'joinCodes', joinCode), {
    code: joinCode,
    familyId,
    type: 'team',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { familyId, joinCode };
}

export async function rotateTeamJoinCode(teamId, uid) {
  const snap = await getDoc(doc(db, 'families', teamId));
  if (!snap.exists()) throw new Error('Fant ikke laget.');
  const team = { id: snap.id, ...snap.data() };
  if (!isGroupAdmin(team, uid)) throw new Error('Kun administrator kan fornye koden.');
  const prev = String(team.joinCode || '').trim().toUpperCase();
  const joinCode = await ensureUniqueJoinCode();
  await updateDoc(doc(db, 'families', teamId), { joinCode, updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'joinCodes', joinCode), {
    code: joinCode,
    familyId: teamId,
    type: team.type || 'team',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (prev && prev !== joinCode) {
    await deleteDoc(doc(db, 'joinCodes', prev)).catch(() => {});
  }
  return joinCode;
}

export async function findTeamByJoinCode(rawCode) {
  const joinCode = normalizeJoinCode(rawCode);
  if (joinCode.length < 6) throw new Error('Ugyldig kode.');
  const mapSnap = await getDoc(doc(db, 'joinCodes', joinCode));
  if (!mapSnap.exists()) throw new Error('Fant ingen lag med denne koden.');
  const mapped = mapSnap.data() || {};
  const familyId = mapped.familyId;
  if (!familyId) throw new Error('Fant ingen lag med denne koden.');
  const type = mapped.type || 'team';
  if (type && !isTeamType(type) && type !== 'team' && type !== 'club') {
    // Allow missing type on legacy maps; reject clear non-team types.
    if (['class', 'classroom', 'friends', 'congregation', 'daycare', 'group', 'family'].includes(String(type).toLowerCase())) {
      throw new Error('Fant ingen lag med denne koden.');
    }
  }
  // Do not read families/{id} here — non-members are denied by rules.
  return { id: familyId, joinCode, type: type || 'team', name: mapped.name || '' };
}

export async function submitTeamJoinRequest({
  joinCode, childFirstName, childLastName, parentUid, parentName, parentEmail,
}) {
  const first = String(childFirstName || '').trim();
  const last = String(childLastName || '').trim();
  if (!first || !last) throw new Error('Oppgi fornavn og etternavn på barnet.');
  if (!parentUid) throw new Error('Du må være innlogget.');
  const res = await submitJoinRequestCallable({
    code: joinCode,
    kind: 'child',
    childFirstName: first,
    childLastName: last,
    parentName: parentName || '',
    parentEmail: (parentEmail || '').toLowerCase(),
  });
  return {
    requestId: res.requestId,
    teamId: res.familyId,
    teamName: res.familyName,
  };
}

export function listenTeamJoinRequests(teamId, cb) {
  const qy = query(
    collection(db, 'families', teamId, 'joinRequests'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function rejectTeamJoinRequest(teamId, requestId, adminUid) {
  await updateDoc(doc(db, 'families', teamId, 'joinRequests', requestId), {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Godkjenn forespørsel: opprett foresatt + barn på laget. */
export async function approveTeamJoinRequest(teamId, requestId, adminUid) {
  const teamRef = doc(db, 'families', teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) throw new Error('Fant ikke laget.');
  const team = { id: teamSnap.id, ...teamSnap.data() };
  if (!isGroupAdmin(team, adminUid)) throw new Error('Kun administrator kan godkjenne.');

  const reqRef = doc(db, 'families', teamId, 'joinRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Forespørselen finnes ikke.');
  const req = reqSnap.data();
  if (req.status !== 'pending') throw new Error('Forespørselen er allerede behandlet.');

  const parentUid = req.parentUid;
  const childId = doc(collection(db, 'families', teamId, 'children')).id;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(doc(db, 'families', teamId, 'parents', parentUid), {
    uid: parentUid,
    name: req.parentName || '',
    email: req.parentEmail || '',
    admin: false,
    superAdmin: false,
    active: true,
    role: 'guardian',
    linkedChildIds: arrayUnion(childId),
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'families', teamId, 'children', childId), {
    id: childId,
    name: req.childName,
    firstName: req.childFirstName,
    lastName: req.childLastName,
    active: true,
    role: 'player',
    guardianUids: [parentUid],
    source: 'join_request',
    joinRequestId: requestId,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(teamRef, {
    members: arrayUnion(parentUid),
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'users', parentUid), {
    familyIds: arrayUnion(teamId),
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'parents', parentUid), {
    familyIds: arrayUnion(teamId),
    updatedAt: now,
  }, { merge: true });

  batch.update(reqRef, {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
    childId,
    updatedAt: now,
  });

  await batch.commit();
  return { childId, parentUid };
}

/** Vegginnlegg (Facebook-stil). */
function normalizePostImageUrls(imageUrls, imageUrl) {
  const urls = Array.isArray(imageUrls)
    ? imageUrls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const single = String(imageUrl || '').trim();
  if (single && !urls.includes(single)) urls.unshift(single);
  return urls.slice(0, 8);
}

export async function createTeamPost({
  teamId, authorUid, authorName, title, body, imageUrl, imageUrls,
}) {
  const urls = normalizePostImageUrls(imageUrls, imageUrl);
  const text = String(body || '').trim();
  if (!text && urls.length === 0) throw new Error('Skriv noe, eller legg ved bilde.');
  const ref = await addDoc(collection(db, 'families', teamId, 'posts'), {
    title: String(title || '').trim() || null,
    body: text,
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

export async function updateTeamPost(teamId, postId, {
  title, body, imageUrl, imageUrls, editorUid, isAdmin = false,
}) {
  const ref = doc(db, 'families', teamId, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Innlegget finnes ikke.');
  const data = snap.data() || {};
  if (!isAdmin && data.authorUid !== editorUid) {
    throw new Error('Du kan bare redigere egne innlegg.');
  }
  const urls = normalizePostImageUrls(
    imageUrls !== undefined ? imageUrls : data.imageUrls,
    imageUrl !== undefined ? imageUrl : data.imageUrl,
  );
  const text = body !== undefined ? String(body || '').trim() : String(data.body || '').trim();
  const nextTitle = title !== undefined
    ? (String(title || '').trim() || null)
    : (data.title || null);
  if (!text && urls.length === 0) throw new Error('Skriv noe, eller legg ved bilde.');
  await updateDoc(ref, {
    title: nextTitle,
    body: text,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTeamPost(teamId, postId, { editorUid, isAdmin = false } = {}) {
  const ref = doc(db, 'families', teamId, 'posts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Innlegget finnes ikke.');
  const data = snap.data() || {};
  if (!isAdmin && data.authorUid !== editorUid) {
    throw new Error('Du kan bare slette egne innlegg.');
  }
  const commentsSnap = await getDocs(collection(ref, 'comments'));
  const batch = writeBatch(db);
  commentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();
}

export function listenTeamPosts(teamId, cb) {
  const qy = query(
    collection(db, 'families', teamId, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function reactToTeamPost(teamId, postId, uid, emoji = '👍') {
  const ref = doc(db, 'families', teamId, 'posts', postId);
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

export function listenTeamPostComments(teamId, postId, cb) {
  if (!teamId || !postId) {
    cb([]);
    return () => {};
  }
  const qy = query(
    collection(db, 'families', teamId, 'posts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function addTeamPostComment({
  teamId, postId, authorUid, authorName, body,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Skriv en kommentar.');
  const postRef = doc(db, 'families', teamId, 'posts', postId);
  const commentsRef = collection(postRef, 'comments');
  await addDoc(commentsRef, {
    body: text,
    authorUid,
    authorName: authorName || 'Ukjent',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(postRef);
  const count = Number(snap.data()?.commentCount || 0) + 1;
  await updateDoc(postRef, {
    commentCount: count,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeamPostComment({
  teamId, postId, commentId, editorUid, body,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Skriv en kommentar.');
  const ref = doc(db, 'families', teamId, 'posts', postId, 'comments', commentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Kommentaren finnes ikke.');
  if (snap.data()?.authorUid !== editorUid) {
    throw new Error('Du kan bare redigere egne kommentarer.');
  }
  await updateDoc(ref, {
    body: text,
    updatedAt: serverTimestamp(),
  });
}

export function listenTeamEvents(teamId, cb) {
  const qy = query(
    collection(db, 'families', teamId, 'events'),
    orderBy('dateKey', 'asc'),
    limit(60),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createTeamEvent({
  teamId, title, dateKey, startTime, endTime, location, locationPlace, memberIds, childIds, authorUid,
}) {
  if (!title?.trim() || !dateKey) throw new Error('Tittel og dato kreves.');
  const place = locationPlace && locationPlace.label
    ? {
      label: locationPlace.label,
      lat: locationPlace.lat ?? null,
      lng: locationPlace.lng ?? null,
      placeId: locationPlace.placeId || null,
    }
    : null;
  const locationLabel = (typeof location === 'string' && location.trim())
    ? location.trim()
    : (place?.label || null);
  const ref = await addDoc(collection(db, 'families', teamId, 'events'), {
    title: title.trim(),
    dateKey,
    startTime: startTime || null,
    endTime: endTime || null,
    location: locationLabel,
    locationPlace: place,
    allDay: !startTime,
    memberIds: Array.isArray(memberIds) ? memberIds.filter(Boolean) : [],
    childIds: Array.isArray(childIds) ? childIds.filter(Boolean) : [],
    inviteCount: (memberIds?.length || 0) + (childIds?.length || 0),
    color: '#2563eb',
    source: 'team',
    createdBy: authorUid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listUserTeams(uid) {
  if (!uid) return [];
  const [mSnap, aSnap, oSnap] = await Promise.all([
    getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
  ]);
  const map = new Map();
  [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => {
    const data = { id: d.id, ...d.data() };
    if (data.deleted === true) return;
    if (!isTeamType(data.type)) return;
    map.set(d.id, data);
  });
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function listUserFamilies(uid) {
  if (!uid) return [];
  const [mSnap, aSnap, oSnap] = await Promise.all([
    getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
  ]);
  const map = new Map();
  [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => {
    const data = { id: d.id, ...d.data() };
    if (data.deleted === true) return;
    if (!isFamilyType(data.type)) return;
    map.set(d.id, data);
  });
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

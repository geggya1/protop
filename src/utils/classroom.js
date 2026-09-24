/**
 * Klasserom / klasse — egen plattform parallell til idrettslag.
 * Bruker families-dokumenter med type class|classroom.
 *
 * Personsensitive elevmapper ligger i toppnivå-samlingen classroomMaps
 * (ikke under families-wildcard) med ACL per seksjon.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  query, where, serverTimestamp, arrayUnion, arrayRemove, writeBatch, orderBy, limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { createGroup, deactivateGroup, isGroupAdmin, isTeamAdmin } from './groups';
import { generateJoinCode, normalizeJoinCode } from './teams';
import { submitJoinRequestByCode as submitJoinRequestCallable } from './joinRequests';
import { CLASSROOM_TYPES, isClassroomType } from './groupTypes';
import { dateKey, parseDateKey, addDays, startOfWeekMonday, getISOWeek } from './dates';

export { CLASSROOM_TYPES, isClassroomType };

export const STAFF_ROLES = [
  { id: 'principal', label: 'Rektor', admin: true, superAdmin: true },
  { id: 'teacher', label: 'Lærer', admin: true, superAdmin: false },
  { id: 'assistant', label: 'Assistent', admin: false, superAdmin: false },
  { id: 'admin', label: 'Skoleadmin', admin: true, superAdmin: false },
];

export function staffRoleLabel(role) {
  return STAFF_ROLES.find((r) => r.id === role)?.label || 'Ansatt';
}

export function isClassroomAdmin(classroom, uid, staff = []) {
  if (isGroupAdmin(classroom, uid) || isTeamAdmin(classroom, uid, staff)) return true;
  if (!uid) return false;
  return (staff || []).some((p) => {
    if ((p.id !== uid && p.uid !== uid) || p.active === false || p.deleted === true) return false;
    if (p.admin || p.superAdmin) return true;
    const meta = STAFF_ROLES.find((r) => r.id === p.staffRole);
    return !!meta?.admin;
  });
}

export function staffRoleOf(classroom, uid, staff = []) {
  if (!uid) return null;
  if (classroom?.ownerUid === uid || classroom?.ownerId === uid) return 'principal';
  const rec = (staff || []).find((p) => (
    (p.id === uid || p.uid === uid) && p.active !== false && p.deleted !== true
  ));
  // Kun eksplisitt ansatt-rolle / admin — foresatte (guardian/parent) er ikke lærer.
  if (rec?.staffRole) return rec.staffRole;
  if (rec?.superAdmin) return 'principal';
  if (rec?.admin) return 'admin';
  if (isGroupAdmin(classroom, uid)) return 'admin';
  return null;
}

/**
 * Elev-identitet for innlogget bruker: egen elev-uid, foresatt via guardianUids,
 * eller linkedChildIds på parent-doc. preferredStudentId (f.eks. aktivt barneprofil).
 */
export function resolveLinkedStudentIds(students, parents, uid) {
  if (!uid) return [];
  const list = (students || []).filter((s) => s && s.deleted !== true && s.active !== false && !s.archived);
  const ids = new Set();
  list.forEach((s) => {
    if (s.uid === uid || (s.guardianUids || []).includes(uid)) ids.add(s.id);
  });
  const parentRec = (parents || []).find((p) => (
    (p.id === uid || p.uid === uid) && p.active !== false && p.deleted !== true
  ));
  (parentRec?.linkedChildIds || []).forEach((id) => {
    if (list.some((s) => s.id === id)) ids.add(id);
  });
  return [...ids];
}

export function resolvePrimaryStudent(students, parents, uid, preferredStudentId) {
  const ids = resolveLinkedStudentIds(students, parents, uid);
  if (!ids.length) return null;
  const list = students || [];
  if (preferredStudentId && ids.includes(preferredStudentId)) {
    return list.find((s) => s.id === preferredStudentId) || null;
  }
  const self = list.find((s) => ids.includes(s.id) && s.uid === uid);
  if (self) return self;
  return list.find((s) => ids.includes(s.id)) || null;
}

async function loadClassroomStaff(classroomId) {
  const snap = await getDocs(collection(db, 'families', classroomId, 'parents'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function assertClassroomAdmin(classroomId, room, uid) {
  const staff = await loadClassroomStaff(classroomId);
  if (!isClassroomAdmin(room, uid, staff)) {
    throw new Error('Kun rektor/admin kan gjøre dette.');
  }
  return staff;
}

export const DEFAULT_SUBJECTS = [
  { name: 'Norsk', color: '#2563eb', icon: 'book' },
  { name: 'Matematikk', color: '#dc2626', icon: 'calculator' },
  { name: 'Engelsk', color: '#7c3aed', icon: 'language' },
  { name: 'Samfunnsfag', color: '#0d9488', icon: 'earth' },
  { name: 'Naturfag', color: '#16a34a', icon: 'leaf' },
  { name: 'Kroppsøving', color: '#ea580c', icon: 'fitness' },
  { name: 'Kunst og håndverk', color: '#db2777', icon: 'color-palette' },
  { name: 'Musikk', color: '#ca8a04', icon: 'musical-notes' },
  { name: 'KRLE', color: '#4f46e5', icon: 'library' },
  { name: 'Mat og helse', color: '#059669', icon: 'restaurant' },
];

export const WEEKDAYS = [
  { id: 1, key: 'mon', label: 'Mandag', short: 'Man' },
  { id: 2, key: 'tue', label: 'Tirsdag', short: 'Tir' },
  { id: 3, key: 'wed', label: 'Onsdag', short: 'Ons' },
  { id: 4, key: 'thu', label: 'Torsdag', short: 'Tor' },
  { id: 5, key: 'fri', label: 'Fredag', short: 'Fre' },
];

export const MAP_SECTIONS = [
  { id: 'journal', label: 'Journal', sensitive: true },
  { id: 'privacy', label: 'Personvern', sensitive: true },
  { id: 'sensitive', label: 'Sensitive hendelser', sensitive: true },
  { id: 'legal', label: 'Lovverk og vedtak', sensitive: true },
  { id: 'treatment', label: 'Behandling', sensitive: true },
  { id: 'followup', label: 'Oppfølging', sensitive: false },
  { id: 'childProtection', label: 'Barnevern', sensitive: true },
  { id: 'paragraph12', label: '§ 12 skolemiljø', sensitive: true },
];

/** Standard tilgang: rektor ser alt. Øvrige roller begrenses. */
export const DEFAULT_SECTION_ROLES = {
  journal: ['principal', 'teacher'],
  privacy: ['principal'],
  sensitive: ['principal'],
  legal: ['principal'],
  treatment: ['principal'],
  followup: ['principal', 'teacher', 'assistant'],
  childProtection: ['principal'],
  paragraph12: ['principal', 'teacher'],
};

export const MESSAGE_AUDIENCES = [
  { id: 'all_students', label: 'Alle elever', icon: 'people' },
  { id: 'all_subjects', label: 'Alle fag', icon: 'book' },
  { id: 'students', label: 'Utvalgte elever', icon: 'person' },
  { id: 'student_subjects', label: 'Elev + fag', icon: 'school' },
  { id: 'subjects', label: 'Utvalgte fag', icon: 'albums' },
];

function mapDocId(classroomId, studentId) {
  return `${classroomId}_${studentId}`;
}

async function ensureUniqueJoinCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateJoinCode(8);
    const mapSnap = await getDoc(doc(db, 'joinCodes', code));
    if (!mapSnap.exists()) return code;
  }
  return generateJoinCode(10);
}

export async function createClassroom({
  name, school, grade, language, user, profile,
}) {
  if (!user?.uid) throw new Error('Du må være innlogget for å opprette klasse.');
  const familyId = await createGroup({
    name: String(name || '').trim() || 'Min klasse',
    type: 'classroom',
    language,
    user,
    profile,
  });
  const joinCode = await ensureUniqueJoinCode();
  const now = serverTimestamp();
  await updateDoc(doc(db, 'families', familyId), {
    joinCode,
    school: String(school || '').trim() || null,
    grade: String(grade || '').trim() || null,
    classroomMode: true,
    updatedAt: now,
  });
  try {
    await updateDoc(doc(db, 'families', familyId, 'parents', user.uid), {
      staffRole: 'principal',
      role: 'principal',
      admin: true,
      superAdmin: true,
      updatedAt: now,
    });
  } catch (err) {
    console.warn('[createClassroom] staffRole', err);
  }
  try {
    const batch = writeBatch(db);
    DEFAULT_SUBJECTS.forEach((sub) => {
      const ref = doc(collection(db, 'families', familyId, 'subjects'));
      batch.set(ref, {
        ...sub,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    await batch.commit();
  } catch (err) {
    // Klasse er opprettet — fag kan legges til senere
    console.warn('[createClassroom] subjects seed', err);
  }
  await setDoc(doc(db, 'joinCodes', joinCode), {
    code: joinCode,
    familyId,
    type: 'classroom',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { familyId, joinCode };
}

export async function rotateClassroomJoinCode(classroomId, uid) {
  const snap = await getDoc(doc(db, 'families', classroomId));
  if (!snap.exists()) throw new Error('Fant ikke klassen.');
  const room = { id: snap.id, ...snap.data() };
  await assertClassroomAdmin(classroomId, room, uid);
  const prev = String(room.joinCode || '').trim().toUpperCase();
  const joinCode = await ensureUniqueJoinCode();
  await updateDoc(doc(db, 'families', classroomId), { joinCode, updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'joinCodes', joinCode), {
    code: joinCode,
    familyId: classroomId,
    type: room.type || 'classroom',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (prev && prev !== joinCode) {
    await deleteDoc(doc(db, 'joinCodes', prev)).catch(() => {});
  }
  return joinCode;
}

export async function findClassroomByJoinCode(rawCode) {
  const joinCode = normalizeJoinCode(rawCode);
  if (joinCode.length < 6) throw new Error('Ugyldig kode.');
  const mapSnap = await getDoc(doc(db, 'joinCodes', joinCode));
  if (!mapSnap.exists()) throw new Error('Fant ingen klasse med denne koden.');
  const mapped = mapSnap.data() || {};
  const familyId = mapped.familyId;
  if (!familyId) throw new Error('Fant ingen klasse med denne koden.');
  const type = mapped.type || 'classroom';
  if (type && !isClassroomType(type) && type !== 'class' && type !== 'classroom') {
    if (['team', 'club', 'friends', 'congregation', 'daycare', 'group', 'family'].includes(String(type).toLowerCase())) {
      throw new Error('Fant ingen klasse med denne koden.');
    }
  }
  return { id: familyId, joinCode, type: type || 'classroom', name: mapped.name || '' };
}

export async function submitClassroomJoinRequest({
  joinCode, childFirstName, childLastName, parentUid, parentName, parentEmail,
}) {
  const first = String(childFirstName || '').trim();
  const last = String(childLastName || '').trim();
  if (!first || !last) throw new Error('Oppgi fornavn og etternavn på eleven.');
  if (!parentUid) throw new Error('Du må være innlogget.');
  const res = await submitJoinRequestCallable({
    code: joinCode,
    kind: 'student',
    childFirstName: first,
    childLastName: last,
    parentName: parentName || '',
    parentEmail: (parentEmail || '').toLowerCase(),
  });
  return {
    requestId: res.requestId,
    classroomId: res.familyId,
    classroomName: res.familyName,
  };
}

export function listenClassroomJoinRequests(classroomId, cb) {
  const qy = query(
    collection(db, 'families', classroomId, 'joinRequests'),
    orderBy('createdAt', 'desc'),
    limit(80),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function rejectClassroomJoinRequest(classroomId, requestId, adminUid) {
  const roomSnap = await getDoc(doc(db, 'families', classroomId));
  if (!roomSnap.exists()) throw new Error('Fant ikke klassen.');
  const room = { id: roomSnap.id, ...roomSnap.data() };
  await assertClassroomAdmin(classroomId, room, adminUid);
  await updateDoc(doc(db, 'families', classroomId, 'joinRequests', requestId), {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function approveClassroomJoinRequest(classroomId, requestId, adminUid) {
  const roomRef = doc(db, 'families', classroomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Fant ikke klassen.');
  const room = { id: roomSnap.id, ...roomSnap.data() };
  await assertClassroomAdmin(classroomId, room, adminUid);

  const reqRef = doc(db, 'families', classroomId, 'joinRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Forespørselen finnes ikke.');
  const req = reqSnap.data();
  if (req.status !== 'pending') throw new Error('Forespørselen er allerede behandlet.');

  const parentUid = req.parentUid;
  const childId = doc(collection(db, 'families', classroomId, 'children')).id;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(doc(db, 'families', classroomId, 'parents', parentUid), {
    uid: parentUid,
    name: req.parentName || '',
    email: req.parentEmail || '',
    admin: false,
    superAdmin: false,
    active: true,
    role: 'guardian',
    staffRole: null,
    linkedChildIds: arrayUnion(childId),
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'families', classroomId, 'children', childId), {
    id: childId,
    name: req.childName,
    firstName: req.childFirstName,
    lastName: req.childLastName,
    active: true,
    role: 'student',
    guardianUids: [parentUid],
    source: 'join_request',
    joinRequestId: requestId,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(roomRef, {
    members: arrayUnion(parentUid),
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'users', parentUid), {
    familyIds: arrayUnion(classroomId),
    updatedAt: now,
  }, { merge: true });

  batch.set(doc(db, 'parents', parentUid), {
    familyIds: arrayUnion(classroomId),
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
  await ensureStudentMap(classroomId, childId, req.childName);
  return { childId, parentUid };
}

export async function listUserClassrooms(uid, { includeDeactivated = false } = {}) {
  if (!uid) return [];
  const [mSnap, aSnap, oSnap] = await Promise.all([
    getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
    getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
  ]);
  const map = new Map();
  [...mSnap.docs, ...aSnap.docs, ...oSnap.docs].forEach((d) => {
    const data = { id: d.id, ...d.data() };
    if (data.deleted === true || data.hiddenFromApp === true) return;
    if (!includeDeactivated && (data.archived === true || data.active === false)) return;
    if (!isClassroomType(data.type)) return;
    map.set(d.id, data);
  });
  return [...map.values()].sort((a, b) => {
    const aOff = a.archived === true || a.active === false;
    const bOff = b.archived === true || b.active === false;
    if (aOff !== bOff) return aOff ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function classroomCreatedMs(room) {
  const t = room?.createdAt;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t === 'number') return t;
  return 0;
}

/**
 * Arkiver tomme duplikat-klasser (samme eier + samme navn) etter dobbelt/trippel-opprettelse.
 * Beholder keepId (eller nyeste). Hopper over klasser som har elever.
 * @returns {Promise<string[]>} id-er som ble arkivert
 */
export async function archiveEmptyDuplicateClassrooms(uid, { keepId } = {}) {
  if (!uid) return [];
  let rooms = [];
  try {
    rooms = await listUserClassrooms(uid);
  } catch {
    return [];
  }
  const owned = rooms.filter((r) => r.ownerUid === uid || r.ownerId === uid);
  if (owned.length < 2) return [];

  const byName = new Map();
  owned.forEach((r) => {
    const key = String(r.name || '').trim().toLowerCase() || `__id:${r.id}`;
    const arr = byName.get(key) || [];
    arr.push(r);
    byName.set(key, arr);
  });

  const archivedIds = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      if (keepId && a.id === keepId) return -1;
      if (keepId && b.id === keepId) return 1;
      return classroomCreatedMs(b) - classroomCreatedMs(a);
    });
    for (const room of ranked.slice(1)) {
      try {
        const kids = await getDocs(
          query(collection(db, 'families', room.id, 'children'), limit(3)),
        );
        const hasActiveStudent = kids.docs.some((d) => {
          const data = d.data() || {};
          return data.deleted !== true && data.active !== false;
        });
        if (hasActiveStudent) continue;
        await deactivateGroup(room.id);
        archivedIds.push(room.id);
      } catch (err) {
        console.warn('[archiveEmptyDuplicateClassrooms]', room.id, err);
      }
    }
  }
  return archivedIds;
}

/* ——— Fag ——— */

export function listenSubjects(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'subjects'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.active !== false && s.deleted !== true)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
      cb(list);
    },
    () => cb([]),
  );
}

export async function createSubject(classroomId, { name, color, icon, teacherUids }) {
  const title = String(name || '').trim();
  if (!title) throw new Error('Fagnavn kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'subjects'), {
    name: title,
    color: color || '#4338ca',
    icon: icon || 'book',
    teacherUids: Array.isArray(teacherUids) ? teacherUids.filter(Boolean) : [],
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSubject(classroomId, subjectId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'subjects', subjectId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveSubject(classroomId, subjectId) {
  await updateSubject(classroomId, subjectId, { active: false, archived: true });
}

/* ——— Timeplan ——— */

export function listenTimetableSlots(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'timetableSlots'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.deleted !== true)
        .sort((a, b) => {
          const wd = (a.weekday || 0) - (b.weekday || 0);
          if (wd) return wd;
          return String(a.startTime || '').localeCompare(String(b.startTime || ''));
        }));
    },
    () => cb([]),
  );
}

export async function createTimetableSlot(classroomId, payload) {
  const weekday = Number(payload.weekday);
  const startTime = String(payload.startTime || '').trim();
  const endTime = String(payload.endTime || '').trim();
  if (!weekday || !startTime || !endTime) throw new Error('Ukedag og tid kreves.');
  if (!payload.fromDate || !payload.toDate) throw new Error('Fra- og tildato kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'timetableSlots'), {
    weekday,
    startTime,
    endTime,
    kind: payload.kind || 'subject',
    subjectId: payload.subjectId || null,
    title: String(payload.title || '').trim() || null,
    location: String(payload.location || '').trim() || null,
    teacherUid: payload.teacherUid || null,
    studentIds: Array.isArray(payload.studentIds) ? payload.studentIds.filter(Boolean) : [],
    groupId: payload.groupId || null,
    repeatsWeekly: payload.repeatsWeekly !== false,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    createdBy: payload.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTimetableSlot(classroomId, slotId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'timetableSlots', slotId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTimetableSlot(classroomId, slotId) {
  await updateDoc(doc(db, 'families', classroomId, 'timetableSlots', slotId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

function inDateRange(key, from, to) {
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

/** Utvid ukentlige timeplan-rader til konkrete dager i [rangeStart, rangeEnd]. */
export function expandTimetableSlots(slots, rangeStartKey, rangeEndKey) {
  const start = parseDateKey(rangeStartKey);
  const end = parseDateKey(rangeEndKey);
  if (!start || !end || Number.isNaN(start.getTime())) return [];
  const out = [];
  const days = Math.max(0, Math.round((end - start) / 86400000));
  for (let i = 0; i <= days; i += 1) {
    const d = addDays(start, i);
    const key = dateKey(d);
    const jsDay = d.getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;
    (slots || []).forEach((slot) => {
      if (Number(slot.weekday) !== weekday) return;
      if (!inDateRange(key, slot.fromDate, slot.toDate)) return;
      out.push({
        ...slot,
        dateKey: key,
        occurrenceId: `${slot.id}_${key}`,
      });
    });
  }
  return out.sort((a, b) => {
    const dk = String(a.dateKey).localeCompare(String(b.dateKey));
    if (dk) return dk;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
}

export function weekRangeKeys(anchor = new Date()) {
  const monday = startOfWeekMonday(anchor);
  return {
    start: dateKey(monday),
    end: dateKey(addDays(monday, 6)),
    monday,
    keys: Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i))),
    iso: getISOWeek(monday),
  };
}

export function monthRangeKeys(anchor = new Date()) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: dateKey(start), end: dateKey(end), year: start.getFullYear(), month: start.getMonth() };
}

export function yearRangeKeys(year) {
  const y = Number(year) || new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31`, year: y };
}

/* ——— Undervisningsplan ——— */

export function listenLessonPlans(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  const qy = query(
    collection(db, 'families', classroomId, 'lessonPlans'),
    orderBy('dateKey', 'desc'),
    limit(120),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.deleted !== true));
  }, () => cb([]));
}

export async function createLessonPlan(classroomId, payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Tittel kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'lessonPlans'), {
    title,
    subjectId: payload.subjectId || null,
    dateKey: payload.dateKey || dateKey(new Date()),
    weekNumber: payload.weekNumber || null,
    year: payload.year || new Date().getFullYear(),
    objectives: Array.isArray(payload.objectives)
      ? payload.objectives.map((o) => String(o || '').trim()).filter(Boolean)
      : [],
    description: String(payload.description || '').trim() || '',
    resources: String(payload.resources || '').trim() || '',
    teacherUid: payload.teacherUid || null,
    teacherName: payload.teacherName || '',
    createdBy: payload.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLessonPlan(classroomId, planId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'lessonPlans', planId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLessonPlan(classroomId, planId) {
  await updateDoc(doc(db, 'families', classroomId, 'lessonPlans', planId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/* ——— Elevgrupper ——— */

export function listenClassGroups(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'classGroups'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((g) => g.deleted !== true)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb')));
    },
    () => cb([]),
  );
}

export async function createClassGroup(classroomId, { name, studentIds, color, createdBy }) {
  const title = String(name || '').trim();
  if (!title) throw new Error('Gruppenavn kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'classGroups'), {
    name: title,
    studentIds: Array.isArray(studentIds) ? studentIds.filter(Boolean) : [],
    color: color || '#4338ca',
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateClassGroup(classroomId, groupId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'classGroups', groupId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClassGroup(classroomId, groupId) {
  await updateDoc(doc(db, 'families', classroomId, 'classGroups', groupId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/* ——— Sitteplan / fysisk klasseromsoppsett ——— */

export const SEATING_UNIT_KINDS = [
  { id: 'desk', label: 'Enkel pult', slots: 1, w: 1, h: 1, icon: 'square-outline' },
  { id: 'pair', label: 'To og to', slots: 2, w: 2, h: 1, icon: 'people-outline' },
  { id: 'table4', label: 'Gruppebord 4', slots: 4, w: 2, h: 2, icon: 'grid-outline' },
  { id: 'table6', label: 'Gruppebord 6', slots: 6, w: 3, h: 2, icon: 'apps-outline' },
  { id: 'teacher', label: 'Lærerpult', slots: 0, w: 2, h: 1, icon: 'person-outline' },
];

export const SEATING_PRESETS = [
  {
    id: 'singles',
    label: 'Enkel pult',
    description: 'Én elev per pult i åpne rekker',
    icon: 'square-outline',
    defaultCols: 6,
    defaultRows: 5,
  },
  {
    id: 'pairs',
    label: 'To og to',
    description: 'Pulter for to side om side',
    icon: 'people-outline',
    defaultCols: 8,
    defaultRows: 5,
  },
  {
    id: 'rows',
    label: 'Klassiske rekker',
    description: 'Tette rekker mot tavla',
    icon: 'menu-outline',
    defaultCols: 7,
    defaultRows: 6,
  },
  {
    id: 'groups4',
    label: 'Grupper (firkant)',
    description: 'Bord med fire elever',
    icon: 'grid-outline',
    defaultCols: 8,
    defaultRows: 6,
  },
  {
    id: 'groups6',
    label: 'Grupper (6)',
    description: 'Større bord med seks plasser',
    icon: 'apps-outline',
    defaultCols: 9,
    defaultRows: 6,
  },
  {
    id: 'u_shape',
    label: 'U-form',
    description: 'Åpen U mot tavla',
    icon: 'git-branch-outline',
    defaultCols: 7,
    defaultRows: 5,
  },
  {
    id: 'blank',
    label: 'Tomt rom',
    description: 'Bygg selv — legg til pult for pult',
    icon: 'add-circle-outline',
    defaultCols: 8,
    defaultRows: 6,
  },
];

function newSlot(index = 0) {
  return { id: `slot_${index}`, studentId: null, displayName: '' };
}

function newUnit(kindId, col, row, label = '') {
  const meta = SEATING_UNIT_KINDS.find((k) => k.id === kindId) || SEATING_UNIT_KINDS[0];
  const slots = Array.from({ length: meta.slots }, (_, i) => newSlot(i));
  return {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind: meta.id,
    col,
    row,
    w: meta.w,
    h: meta.h,
    label: label || '',
    slots,
  };
}

function unitFits(units, cols, rows, candidate) {
  if (candidate.col < 0 || candidate.row < 0) return false;
  if (candidate.col + candidate.w > cols || candidate.row + candidate.h > rows) return false;
  return !(units || []).some((u) => (
    candidate.col < u.col + u.w
    && candidate.col + candidate.w > u.col
    && candidate.row < u.row + u.h
    && candidate.row + candidate.h > u.row
  ));
}

/** Generer units for et forhåndsvalg (fleksibelt rom-oppsett). */
export function buildSeatingLayout(presetId, { cols, rows } = {}) {
  const preset = SEATING_PRESETS.find((p) => p.id === presetId) || SEATING_PRESETS[0];
  const c = Math.max(4, Math.min(12, Number(cols) || preset.defaultCols));
  const r = Math.max(3, Math.min(10, Number(rows) || preset.defaultRows));
  const units = [];
  const id = preset.id;

  if (id === 'blank') {
    return { preset: id, cols: c, rows: r, frontLabel: 'Tavle', units };
  }

  if (id === 'singles' || id === 'rows') {
    const tight = id === 'rows';
    const step = tight ? 1 : 2;
    const startCol = tight ? 0 : 0;
    let n = 1;
    for (let row = 1; row < r; row += 1) {
      for (let col = startCol; col < c; col += step) {
        if (unitFits(units, c, r, { col, row, w: 1, h: 1 })) {
          units.push(newUnit('desk', col, row, `Pult ${n}`));
          n += 1;
        }
      }
    }
  } else if (id === 'pairs') {
    let n = 1;
    for (let row = 1; row < r; row += 1) {
      for (let col = 0; col + 2 <= c; col += 3) {
        if (unitFits(units, c, r, { col, row, w: 2, h: 1 })) {
          units.push(newUnit('pair', col, row, `Par ${n}`));
          n += 1;
        }
      }
    }
  } else if (id === 'groups4') {
    let n = 1;
    for (let row = 1; row + 1 < r; row += 3) {
      for (let col = 0; col + 1 < c; col += 3) {
        if (unitFits(units, c, r, { col, row, w: 2, h: 2 })) {
          units.push(newUnit('table4', col, row, `Gruppe ${n}`));
          n += 1;
        }
      }
    }
  } else if (id === 'groups6') {
    let n = 1;
    for (let row = 1; row + 1 < r; row += 3) {
      for (let col = 0; col + 2 < c; col += 4) {
        if (unitFits(units, c, r, { col, row, w: 3, h: 2 })) {
          units.push(newUnit('table6', col, row, `Bord ${n}`));
          n += 1;
        }
      }
    }
  } else if (id === 'u_shape') {
    let n = 1;
    // Venstre bein
    for (let row = 1; row < r; row += 1) {
      if (unitFits(units, c, r, { col: 0, row, w: 1, h: 1 })) {
        units.push(newUnit('desk', 0, row, `Pult ${n++}`));
      }
    }
    // Høyre bein
    for (let row = 1; row < r; row += 1) {
      if (unitFits(units, c, r, { col: c - 1, row, w: 1, h: 1 })) {
        units.push(newUnit('desk', c - 1, row, `Pult ${n++}`));
      }
    }
    // Bunnen av U
    for (let col = 1; col < c - 1; col += 1) {
      if (unitFits(units, c, r, { col, row: r - 1, w: 1, h: 1 })) {
        units.push(newUnit('desk', col, r - 1, `Pult ${n++}`));
      }
    }
  }

  // Lærerpult midt foran (rad 0) når det er plass
  const teacherCol = Math.max(0, Math.floor((c - 2) / 2));
  if (unitFits(units, c, r, { col: teacherCol, row: 0, w: 2, h: 1 })) {
    units.unshift(newUnit('teacher', teacherCol, 0, 'Lærer'));
  }

  return { preset: id, cols: c, rows: r, frontLabel: 'Tavle', units };
}

export function seatingUnitMeta(kindId) {
  return SEATING_UNIT_KINDS.find((k) => k.id === kindId) || SEATING_UNIT_KINDS[0];
}

export function seatingPresetMeta(presetId) {
  return SEATING_PRESETS.find((p) => p.id === presetId) || SEATING_PRESETS[0];
}

export function countSeatingSlots(plan) {
  return (plan?.units || []).reduce((n, u) => n + (u.slots || []).length, 0);
}

export function countAssignedSeats(plan) {
  return (plan?.units || []).reduce(
    (n, u) => n + (u.slots || []).filter((s) => s.studentId || String(s.displayName || '').trim()).length,
    0,
  );
}

/** Finn ledig plass for ny unit (øverst til venstre). */
export function findFreeSeatingSpot(plan, kindId) {
  const meta = seatingUnitMeta(kindId);
  const cols = plan?.cols || 8;
  const rows = plan?.rows || 6;
  const units = plan?.units || [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const candidate = { col, row, w: meta.w, h: meta.h };
      if (unitFits(units, cols, rows, candidate)) {
        return { col, row };
      }
    }
  }
  return null;
}

export function addSeatingUnit(plan, kindId, label = '') {
  const spot = findFreeSeatingSpot(plan, kindId);
  if (!spot) throw new Error('Ikke mer plass i rommet. Øk antall rader/kolonner.');
  const unit = newUnit(kindId, spot.col, spot.row, label);
  return { ...(plan || {}), units: [...(plan.units || []), unit] };
}

export function assignSeatingSlot(plan, unitId, slotId, { studentId = null, displayName = '' } = {}) {
  const units = (plan?.units || []).map((u) => {
    if (u.id !== unitId) return u;
    return {
      ...u,
      slots: (u.slots || []).map((s) => (
        s.id === slotId
          ? { ...s, studentId: studentId || null, displayName: String(displayName || '').trim() }
          : s
      )),
    };
  });
  return { ...plan, units };
}

export function clearSeatingAssignments(plan) {
  const units = (plan?.units || []).map((u) => ({
    ...u,
    slots: (u.slots || []).map((s) => ({ ...s, studentId: null, displayName: '' })),
  }));
  return { ...plan, units };
}

export function listenSeatingPlans(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'seatingPlans'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.deleted !== true)
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
          return tb - ta || (a.name || '').localeCompare(b.name || '', 'nb');
        }));
    },
    () => cb([]),
  );
}

export async function createSeatingPlan(classroomId, {
  name, preset = 'singles', cols, rows, createdBy, frontLabel,
}) {
  const title = String(name || '').trim() || 'Sitteplan';
  const layout = buildSeatingLayout(preset, { cols, rows });
  const ref = await addDoc(collection(db, 'families', classroomId, 'seatingPlans'), {
    name: title,
    preset: layout.preset,
    cols: layout.cols,
    rows: layout.rows,
    frontLabel: frontLabel || layout.frontLabel || 'Tavle',
    units: layout.units,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSeatingPlan(classroomId, planId, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  // Unngå å skrive id-feltet
  delete next.id;
  await updateDoc(doc(db, 'families', classroomId, 'seatingPlans', planId), next);
}

export async function deleteSeatingPlan(classroomId, planId) {
  await updateDoc(doc(db, 'families', classroomId, 'seatingPlans', planId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function regenerateSeatingPlan(classroomId, planId, {
  preset, cols, rows, keepAssignments = false, previous,
}) {
  const layout = buildSeatingLayout(preset, { cols, rows });
  let units = layout.units;
  if (keepAssignments && previous?.units?.length) {
    const pool = [];
    previous.units.forEach((u) => {
      (u.slots || []).forEach((s) => {
        if (s.studentId || String(s.displayName || '').trim()) pool.push(s);
      });
    });
    units = units.map((u) => ({
      ...u,
      slots: (u.slots || []).map((s) => {
        const next = pool.shift();
        return next
          ? { ...s, studentId: next.studentId || null, displayName: next.displayName || '' }
          : s;
      }),
    }));
  }
  await updateSeatingPlan(classroomId, planId, {
    preset: layout.preset,
    cols: layout.cols,
    rows: layout.rows,
    frontLabel: layout.frontLabel,
    units,
  });
}

/* ——— Undervisningstilbud ——— */

export function listenLessonOffers(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'lessonOffers'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.deleted !== true)
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'nb')));
    },
    () => cb([]),
  );
}

export async function createLessonOffer(classroomId, payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Tittel kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'lessonOffers'), {
    title,
    subjectId: payload.subjectId || null,
    teacherUids: Array.isArray(payload.teacherUids) ? payload.teacherUids.filter(Boolean) : [],
    description: String(payload.description || '').trim() || '',
    hoursPerWeek: Number(payload.hoursPerWeek) || null,
    status: payload.status || 'active',
    createdBy: payload.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLessonOffer(classroomId, offerId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'lessonOffers', offerId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLessonOffer(classroomId, offerId) {
  await updateDoc(doc(db, 'families', classroomId, 'lessonOffers', offerId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/* ——— Pensumliste / bøker ——— */

export function listenBookLists(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'bookLists'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((b) => b.deleted !== true)
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'nb')));
    },
    () => cb([]),
  );
}

export async function createBookListItem(classroomId, payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Boktittel kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'bookLists'), {
    title,
    author: String(payload.author || '').trim() || '',
    isbn: String(payload.isbn || '').trim() || '',
    subjectId: payload.subjectId || null,
    required: payload.required !== false,
    purchaseUrl: String(payload.purchaseUrl || '').trim() || '',
    notes: String(payload.notes || '').trim() || '',
    createdBy: payload.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBookListItem(classroomId, itemId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'bookLists', itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBookListItem(classroomId, itemId) {
  await updateDoc(doc(db, 'families', classroomId, 'bookLists', itemId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/* ——— Beskjeder (ikke chat) ——— */

export function listenClassMessages(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  const qy = query(
    collection(db, 'families', classroomId, 'classMessages'),
    orderBy('createdAt', 'desc'),
    limit(80),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.deleted !== true));
  }, () => cb([]));
}

export async function createClassMessage(classroomId, payload) {
  const body = String(payload.body || '').trim();
  const title = String(payload.title || '').trim();
  if (!title && !body) throw new Error('Skriv en beskjed.');
  const audience = payload.audience || 'all_students';
  const studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(Boolean) : [];
  const subjectIds = Array.isArray(payload.subjectIds) ? payload.subjectIds.filter(Boolean) : [];
  if ((audience === 'students' || audience === 'student_subjects') && !studentIds.length) {
    throw new Error('Velg minst én elev.');
  }
  if ((audience === 'subjects' || audience === 'student_subjects' || audience === 'all_subjects') && audience !== 'all_subjects' && audience !== 'all_students') {
    if ((audience === 'subjects' || audience === 'student_subjects') && !subjectIds.length) {
      throw new Error('Velg minst ett fag.');
    }
  }
  const ref = await addDoc(collection(db, 'families', classroomId, 'classMessages'), {
    title: title || null,
    body,
    audience,
    studentIds,
    subjectIds,
    authorUid: payload.authorUid || null,
    authorName: payload.authorName || '',
    readBy: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function markClassMessageRead(classroomId, messageId, uid) {
  if (!uid) return;
  const ref = doc(db, 'families', classroomId, 'classMessages', messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const readBy = { ...(snap.data()?.readBy || {}), [uid]: Date.now() };
  await updateDoc(ref, { readBy, updatedAt: serverTimestamp() });
}

function subjectsIntersect(messageSubjectIds, studentSubjectIds) {
  const msg = messageSubjectIds || [];
  if (!msg.length) return true;
  const mine = studentSubjectIds || [];
  // Ingen fagkobling på elev = hele klassen (standard til enrollment finnes)
  if (!mine.length) return true;
  return msg.some((id) => mine.includes(id));
}

export function messageVisibleTo({ message, uid, isStaff, studentId, studentSubjectIds }) {
  if (!message) return false;
  if (isStaff) return true;
  const aud = message.audience;
  if (aud === 'all_students' || aud === 'all_subjects') return true;
  if (aud === 'students' || aud === 'student_subjects') {
    const inList = (studentId && (message.studentIds || []).includes(studentId))
      || (uid && (message.studentIds || []).includes(uid));
    if (!inList) return false;
    if (aud === 'student_subjects') {
      return subjectsIntersect(message.subjectIds, studentSubjectIds);
    }
    return true;
  }
  if (aud === 'subjects') {
    return subjectsIntersect(message.subjectIds, studentSubjectIds);
  }
  return false;
}

export function listenMessageComments(classroomId, messageId, cb) {
  if (!classroomId || !messageId) { cb([]); return () => {}; }
  const qy = query(
    collection(db, 'families', classroomId, 'classMessages', messageId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.deleted !== true));
  }, () => cb([]));
}

export async function addMessageComment(classroomId, messageId, {
  body, authorUid, authorName, authorRole,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Skriv en kommentar.');
  const ref = await addDoc(
    collection(db, 'families', classroomId, 'classMessages', messageId, 'comments'),
    {
      body: text,
      authorUid: authorUid || null,
      authorName: authorName || '',
      authorRole: authorRole || 'student',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
  try {
    const msg = await getDoc(doc(db, 'families', classroomId, 'classMessages', messageId));
    const n = Number(msg.data()?.commentCount || 0) + 1;
    await updateDoc(doc(db, 'families', classroomId, 'classMessages', messageId), {
      commentCount: n,
      lastCommentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch { /* ignore */ }
  return ref.id;
}

/* ——— Google Classroom-inspirert: emner, klassearbeid, innlevering, karakter ——— */

export const CLASSWORK_TYPES = [
  { id: 'assignment', label: 'Oppgave', icon: 'document-text', needsSubmit: true },
  { id: 'material', label: 'Materiell', icon: 'folder-open', needsSubmit: false },
  { id: 'question', label: 'Spørsmål', icon: 'help-circle', needsSubmit: true },
];

export const SUBMISSION_STATUS = {
  assigned: { id: 'assigned', label: 'Tildelt' },
  turned_in: { id: 'turned_in', label: 'Innlevert' },
  returned: { id: 'returned', label: 'Returnert' },
  missing: { id: 'missing', label: 'Mangler' },
};

function parseDueAt(value, { endOfDay = true } = {}) {
  if (!value) return null;
  // Firestore Timestamp → Date (må ha .getTime())
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof value?.toMillis === 'function') {
    const d = new Date(value.toMillis());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  // YYYY-MM-DD: frist = slutten av dagen; planlagt publisering = starten av dagen
  const d = new Date(s.includes('T') ? s : `${s}${endOfDay ? 'T23:59:00' : 'T00:00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Planlagt publisering — dato uten klokkeslett = start of day (synlig hele dagen). */
function parseScheduledAt(value) {
  return parseDueAt(value, { endOfDay: false });
}

export function classworkTypeMeta(type) {
  return CLASSWORK_TYPES.find((t) => t.id === type) || CLASSWORK_TYPES[0];
}

export function listenClassTopics(classroomId, cb) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'classTopics'),
    (snap) => {
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.deleted !== true)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
          || (a.name || '').localeCompare(b.name || '', 'nb')));
    },
    () => cb([]),
  );
}

export async function createClassTopic(classroomId, { name, createdBy, order }) {
  const title = String(name || '').trim();
  if (!title) throw new Error('Emnenavn kreves.');
  const ref = await addDoc(collection(db, 'families', classroomId, 'classTopics'), {
    name: title,
    order: Number.isFinite(order) ? order : Date.now(),
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateClassTopic(classroomId, topicId, patch) {
  await updateDoc(doc(db, 'families', classroomId, 'classTopics', topicId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClassTopic(classroomId, topicId) {
  await updateDoc(doc(db, 'families', classroomId, 'classTopics', topicId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export function listenClasswork(classroomId, cb, { includeDrafts = false } = {}) {
  if (!classroomId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'classwork'),
    (snap) => {
      const now = Date.now();
      cb(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => {
          if (x.deleted === true) return false;
          if (x.status === 'draft') return includeDrafts;
          // Planlagt: skjul for elever til scheduledFor/scheduledDate er passert
          if (!includeDrafts) {
            const scheduled = parseScheduledAt(x.scheduledFor || x.scheduledDate);
            if (scheduled && scheduled.getTime() > now) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
          const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
          return tb - ta;
        }));
    },
    () => cb([]),
  );
}

export async function createClassworkItem(classroomId, payload) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Tittel kreves.');
  const type = CLASSWORK_TYPES.some((t) => t.id === payload.type) ? payload.type : 'assignment';
  const links = Array.isArray(payload.links)
    ? payload.links.map((l) => ({
      url: String(l.url || '').trim(),
      title: String(l.title || '').trim() || String(l.url || '').trim(),
    })).filter((l) => l.url)
    : [];
  const due = parseDueAt(payload.dueAt || payload.dueDate);
  const scheduled = parseScheduledAt(payload.scheduledFor || payload.scheduledDate);
  const ref = await addDoc(collection(db, 'families', classroomId, 'classwork'), {
    type,
    title,
    instructions: String(payload.instructions || '').trim() || '',
    topicId: payload.topicId || null,
    subjectId: payload.subjectId || null,
    dueAt: due || null,
    dueDate: payload.dueDate || (due ? due.toISOString().slice(0, 10) : null),
    scheduledFor: scheduled || null,
    scheduledDate: payload.scheduledDate || (scheduled ? scheduled.toISOString().slice(0, 10) : null),
    maxPoints: payload.maxPoints == null || payload.maxPoints === ''
      ? null
      : Number(payload.maxPoints),
    links,
    questionType: payload.questionType || (type === 'question' ? 'short' : null),
    options: Array.isArray(payload.options) ? payload.options.filter(Boolean) : [],
    assignedStudentIds: Array.isArray(payload.assignedStudentIds)
      ? payload.assignedStudentIds.filter(Boolean)
      : [],
    status: payload.status || 'published',
    allowComments: payload.allowComments !== false,
    createdBy: payload.createdBy || null,
    createdByName: payload.createdByName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateClassworkItem(classroomId, itemId, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if ('dueAt' in patch || 'dueDate' in patch) {
    const due = parseDueAt(patch.dueAt || patch.dueDate);
    next.dueAt = due || null;
    next.dueDate = patch.dueDate || (due ? due.toISOString().slice(0, 10) : null);
  }
  if ('scheduledFor' in patch || 'scheduledDate' in patch) {
    const scheduled = parseScheduledAt(patch.scheduledFor || patch.scheduledDate);
    next.scheduledFor = scheduled || null;
    next.scheduledDate = patch.scheduledDate || (scheduled ? scheduled.toISOString().slice(0, 10) : null);
  }
  if ('maxPoints' in patch) {
    next.maxPoints = patch.maxPoints == null || patch.maxPoints === ''
      ? null
      : Number(patch.maxPoints);
  }
  await updateDoc(doc(db, 'families', classroomId, 'classwork', itemId), next);
}

export async function deleteClassworkItem(classroomId, itemId) {
  await updateDoc(doc(db, 'families', classroomId, 'classwork', itemId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/** Kopier oppgave/materiell (reuse mellom klasser eller samme klasse). */
export async function reuseClassworkItem(classroomId, sourceItem, {
  createdBy, createdByName, topicId,
} = {}) {
  if (!sourceItem) throw new Error('Mangler kilde.');
  return createClassworkItem(classroomId, {
    type: sourceItem.type,
    title: sourceItem.title,
    instructions: sourceItem.instructions,
    topicId: topicId ?? sourceItem.topicId,
    subjectId: sourceItem.subjectId,
    dueDate: null,
    maxPoints: sourceItem.maxPoints,
    links: sourceItem.links || [],
    questionType: sourceItem.questionType,
    options: sourceItem.options || [],
    assignedStudentIds: [],
    status: 'draft',
    createdBy,
    createdByName,
  });
}

export function classworkVisibleToStudent(item, studentId, now = new Date()) {
  if (!item || item.deleted) return false;
  if (item.status === 'draft') return false;
  const scheduled = parseScheduledAt(item.scheduledFor || item.scheduledDate);
  if (scheduled && scheduled.getTime() > now.getTime()) return false;
  const ids = item.assignedStudentIds || [];
  if (!ids.length) return true;
  return !!studentId && ids.includes(studentId);
}

export function listenSubmissions(classroomId, classworkId, cb) {
  if (!classroomId || !classworkId) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'families', classroomId, 'classwork', classworkId, 'submissions'),
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    () => cb([]),
  );
}

export async function ensureStudentSubmission(classroomId, classworkId, student) {
  if (!classroomId || !classworkId || !student?.id) return null;
  const ref = doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', student.id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const payload = {
    studentId: student.id,
    studentUid: student.uid || null,
    studentName: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    status: 'assigned',
    textAnswer: '',
    links: [],
    grade: null,
    feedback: '',
    turnedInAt: null,
    returnedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return { id: student.id, ...payload };
}

export async function turnInClasswork(classroomId, classworkId, student, {
  textAnswer, links, selectedOption,
} = {}) {
  if (!student?.id) throw new Error('Elev mangler.');
  await ensureStudentSubmission(classroomId, classworkId, student);
  const ref = doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', student.id);
  await updateDoc(ref, {
    status: 'turned_in',
    textAnswer: String(textAnswer || '').trim(),
    selectedOption: selectedOption || null,
    links: Array.isArray(links)
      ? links.map((l) => ({
        url: String(l.url || '').trim(),
        title: String(l.title || '').trim() || String(l.url || '').trim(),
      })).filter((l) => l.url)
      : [],
    turnedInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function unsubmitClasswork(classroomId, classworkId, studentId) {
  const ref = doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', studentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Ingen innlevering å angre.');
  if (snap.data()?.status === 'returned') {
    throw new Error('Oppgaven er returnert. Du kan ikke angre innlevering.');
  }
  await updateDoc(ref, {
    status: 'assigned',
    turnedInAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function gradeSubmission(classroomId, classworkId, studentId, {
  grade, feedback, returnWork = true, gradedBy, student,
} = {}) {
  if (!studentId) throw new Error('Elev mangler.');
  // Opprett submission-doc om eleven aldri har åpnet oppgaven.
  await ensureStudentSubmission(
    classroomId,
    classworkId,
    student?.id ? student : { id: studentId, name: student?.name || '' },
  );
  const patch = {
    grade: grade == null || grade === '' ? null : Number(grade),
    feedback: String(feedback || '').trim(),
    gradedBy: gradedBy || null,
    updatedAt: serverTimestamp(),
  };
  if (returnWork) {
    patch.status = 'returned';
    patch.returnedAt = serverTimestamp();
  }
  await updateDoc(
    doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', studentId),
    patch,
  );
}

/** Marker materiell som sett/ferdig (Google Classroom «mark as done»). */
export async function markClassworkDone(classroomId, classworkId, student) {
  if (!student?.id) throw new Error('Elev mangler.');
  await ensureStudentSubmission(classroomId, classworkId, student);
  await updateDoc(
    doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', student.id),
    {
      status: 'turned_in',
      markedDone: true,
      turnedInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
}

export function listenSubmissionComments(classroomId, classworkId, studentId, cb) {
  if (!classroomId || !classworkId || !studentId) { cb([]); return () => {}; }
  const qy = query(
    collection(
      db, 'families', classroomId, 'classwork', classworkId, 'submissions', studentId, 'privateComments',
    ),
    orderBy('createdAt', 'asc'),
    limit(80),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.deleted !== true));
  }, () => cb([]));
}

/** Privat kommentar lærer ↔ elev på innlevering (som i Google Classroom). */
export async function addSubmissionComment(classroomId, classworkId, studentId, {
  body, authorUid, authorName, authorRole,
}) {
  const text = String(body || '').trim();
  if (!text) throw new Error('Skriv en kommentar.');
  if (!studentId) throw new Error('Elev mangler.');
  const ref = await addDoc(
    collection(
      db, 'families', classroomId, 'classwork', classworkId, 'submissions', studentId, 'privateComments',
    ),
    {
      body: text,
      authorUid: authorUid || null,
      authorName: authorName || '',
      authorRole: authorRole || 'student',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
  await updateDoc(
    doc(db, 'families', classroomId, 'classwork', classworkId, 'submissions', studentId),
    {
      lastPrivateCommentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  ).catch(() => {});
  return ref.id;
}

export function submissionStatusFor(item, submission, now = new Date()) {
  if (!item) return 'assigned';
  if (submission?.status === 'returned') return 'returned';
  if (submission?.status === 'turned_in') return 'turned_in';
  const due = parseDueAt(item.dueAt || item.dueDate);
  if (due && due.getTime() < now.getTime() && classworkTypeMeta(item.type).needsSubmit) {
    return 'missing';
  }
  return submission?.status || 'assigned';
}

/** Elevens «Å gjøre» — oppgaver/spørsmål/materiell. */
export function buildStudentTodo(classwork, submissionsByWorkId, studentId, now = new Date()) {
  const items = (classwork || []).filter((w) => classworkVisibleToStudent(w, studentId));
  const assigned = [];
  const missing = [];
  const done = [];
  items.forEach((w) => {
    const sub = submissionsByWorkId?.[w.id];
    const meta = classworkTypeMeta(w.type);
    if (w.type === 'material') {
      const row = { ...w, submission: sub || null, status: sub?.markedDone || sub?.status === 'turned_in' ? 'turned_in' : 'assigned' };
      if (row.status === 'turned_in') done.push(row);
      else assigned.push(row);
      return;
    }
    if (!meta.needsSubmit) return;
    const st = submissionStatusFor(w, sub, now);
    const row = { ...w, submission: sub || null, status: st };
    if (st === 'turned_in' || st === 'returned') done.push(row);
    else if (st === 'missing') missing.push(row);
    else assigned.push(row);
  });
  const byDue = (a, b) => {
    const da = parseDueAt(a.dueAt || a.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    const dbv = parseDueAt(b.dueAt || b.dueDate)?.getTime() || Number.MAX_SAFE_INTEGER;
    return da - dbv;
  };
  return {
    assigned: assigned.sort(byDue),
    missing: missing.sort(byDue),
    done: done.sort(byDue),
  };
}

/** Karakterbok: rader = elever, kolonner = vurderte oppgaver. */
export function buildGradebook(students, classwork, submissionsMap) {
  const gradedWork = (classwork || []).filter((w) => classworkTypeMeta(w.type).needsSubmit);
  const rows = (students || []).map((s) => {
    const cells = {};
    let earned = 0;
    let possible = 0;
    gradedWork.forEach((w) => {
      const sub = submissionsMap?.[w.id]?.[s.id];
      const status = submissionStatusFor(w, sub);
      cells[w.id] = {
        grade: sub?.grade ?? null,
        status,
        feedback: sub?.feedback || '',
      };
      if (w.maxPoints != null && Number.isFinite(Number(w.maxPoints))) {
        possible += Number(w.maxPoints);
        if (sub?.grade != null && Number.isFinite(Number(sub.grade))) {
          earned += Number(sub.grade);
        }
      }
    });
    return {
      student: s,
      cells,
      earned,
      possible,
      pct: possible > 0 ? Math.round((earned / possible) * 100) : null,
    };
  });
  return { work: gradedWork, rows };
}

/* ——— Elever (masseinnlegging) ——— */

export function parseStudentNames(raw) {
  return String(raw || '')
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cleaned = line.replace(/^\d+[\.)]\s*/, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
      const parts = cleaned.split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ');
      return { firstName, lastName, name: `${firstName} ${lastName}`.trim() };
    })
    .filter((p) => p.name);
}

export async function addClassroomStudents({ classroomId, names, createdBy }) {
  const list = Array.isArray(names) ? names : parseStudentNames(names);
  if (!list.length) throw new Error('Oppgi minst ett navn.');
  if (list.length > 80) throw new Error('Maks 80 elever om gangen.');
  const now = serverTimestamp();
  const created = [];
  // Firestore batch max 500; 80 elever × 2 writes is fine.
  const batch = writeBatch(db);
  list.forEach((p) => {
    const ref = doc(collection(db, 'families', classroomId, 'children'));
    batch.set(ref, {
      id: ref.id,
      name: p.name,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      active: true,
      role: 'student',
      source: 'staff_add',
      createdBy: createdBy || null,
      createdAt: now,
      updatedAt: now,
    });
    created.push({ id: ref.id, name: p.name });
  });
  await batch.commit();
  const room = await getDoc(doc(db, 'families', classroomId));
  const ownerUid = room.exists() ? (room.data()?.ownerUid || null) : null;
  const adminUids = room.exists() && Array.isArray(room.data()?.adminUids) ? room.data().adminUids : [];
  const access = defaultAccess();
  const viewers = new Set([ownerUid, ...adminUids].filter(Boolean));
  try {
    const staffSnap = await getDocs(collection(db, 'families', classroomId, 'parents'));
    staffSnap.docs.forEach((d) => {
      const p = d.data() || {};
      const sid = p.uid || d.id;
      if (!sid || p.active === false || p.placeholder) return;
      const role = p.staffRole || (p.superAdmin ? 'principal' : (p.admin ? 'admin' : null));
      if (!role) return;
      if (Object.values(access).some((acl) => (acl.roles || []).includes(role))) viewers.add(sid);
    });
  } catch {}
  const mapBatch = writeBatch(db);
  const nowMaps = serverTimestamp();
  created.forEach((c) => {
    mapBatch.set(doc(db, 'classroomMaps', mapDocId(classroomId, c.id)), {
      classroomId,
      studentId: c.id,
      studentName: c.name || '',
      access,
      viewerUids: [...viewers],
      rightsProtectorUids: ownerUid ? [ownerUid] : [],
      createdAt: nowMaps,
      updatedAt: nowMaps,
    }, { merge: true });
  });
  await mapBatch.commit();
  return created;
}

export async function setStaffRole(classroomId, staffUid, staffRole) {
  const meta = STAFF_ROLES.find((r) => r.id === staffRole);
  if (!meta) throw new Error('Ugyldig rolle.');
  const now = serverTimestamp();
  await updateDoc(doc(db, 'families', classroomId, 'parents', staffUid), {
    staffRole,
    role: staffRole,
    admin: !!meta.admin,
    superAdmin: !!meta.superAdmin,
    updatedAt: now,
  });
  const famSnap = await getDoc(doc(db, 'families', classroomId));
  const ownerUid = famSnap.data()?.ownerUid || famSnap.data()?.ownerId;
  if (meta.admin) {
    await updateDoc(doc(db, 'families', classroomId), {
      adminUids: arrayUnion(staffUid),
      updatedAt: now,
    });
  } else if (ownerUid !== staffUid) {
    // Nedgradering (f.eks. assistent): fjern admin-rettighet
    await updateDoc(doc(db, 'families', classroomId), {
      adminUids: arrayRemove(staffUid),
      updatedAt: now,
    }).catch(() => {});
  }
}

/* ——— Elevmapper (ACL + journal) ——— */

function defaultAccess() {
  const access = {};
  MAP_SECTIONS.forEach((s) => {
    access[s.id] = {
      roles: [...(DEFAULT_SECTION_ROLES[s.id] || ['principal'])],
      uids: [],
    };
  });
  return access;
}

export async function ensureStudentMap(classroomId, studentId, studentName = '') {
  const id = mapDocId(classroomId, studentId);
  const ref = doc(db, 'classroomMaps', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return id;
  const room = await getDoc(doc(db, 'families', classroomId));
  const ownerUid = room.exists() ? (room.data()?.ownerUid || null) : null;
  const adminUids = room.exists() && Array.isArray(room.data()?.adminUids) ? room.data().adminUids : [];
  const access = defaultAccess();
  const viewers = new Set([ownerUid, ...adminUids].filter(Boolean));
  try {
    const staffSnap = await getDocs(collection(db, 'families', classroomId, 'parents'));
    staffSnap.docs.forEach((d) => {
      const p = d.data() || {};
      const uid = p.uid || d.id;
      if (!uid || p.active === false || p.placeholder) return;
      const role = p.staffRole || (p.superAdmin ? 'principal' : (p.admin ? 'admin' : null));
      if (!role) return;
      const any = Object.values(access).some((acl) => (acl.roles || []).includes(role));
      if (any) viewers.add(uid);
    });
  } catch {
    // ACL rebuild best-effort
  }
  await setDoc(ref, {
    classroomId,
    studentId,
    studentName: studentName || '',
    access,
    viewerUids: [...viewers],
    rightsProtectorUids: ownerUid ? [ownerUid] : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export function listenStudentMap(classroomId, studentId, cb) {
  if (!classroomId || !studentId) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, 'classroomMaps', mapDocId(classroomId, studentId)),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => cb(null),
  );
}

export function listenMapEntries(classroomId, studentId, cb) {
  if (!classroomId || !studentId) { cb([]); return () => {}; }
  const qy = query(
    collection(db, 'classroomMaps', mapDocId(classroomId, studentId), 'entries'),
    orderBy('createdAt', 'desc'),
    limit(120),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.deleted !== true));
  }, () => cb([]));
}

export function canViewMapSection({ mapDoc, sectionId, uid, staffRole, isOwner }) {
  if (!uid) return false;
  if (isOwner) return true;
  if ((mapDoc?.rightsProtectorUids || []).includes(uid)) return true;
  const acl = mapDoc?.access?.[sectionId];
  if (!acl) return staffRole === 'principal';
  if ((acl.uids || []).includes(uid)) return true;
  if (staffRole && (acl.roles || []).includes(staffRole)) return true;
  return false;
}

export async function updateMapAccess(classroomId, studentId, { access, rightsProtectorUids, actorUid }) {
  const id = mapDocId(classroomId, studentId);
  const ref = doc(db, 'classroomMaps', id);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const room = await getDoc(doc(db, 'families', classroomId));
  const ownerUid = room.exists() ? room.data()?.ownerUid : null;
  const protectors = [...new Set([
    ownerUid,
    ...((rightsProtectorUids != null ? rightsProtectorUids : prev.rightsProtectorUids) || []),
  ].filter(Boolean))];
  const nextAccess = access || prev.access || defaultAccess();
  const viewerSet = new Set(protectors);
  Object.values(nextAccess).forEach((acl) => {
    (acl.uids || []).forEach((u) => viewerSet.add(u));
  });
  const staffSnap = await getDocs(collection(db, 'families', classroomId, 'parents'));
  staffSnap.docs.forEach((d) => {
    const p = d.data() || {};
    // Ikke fallback til 'teacher' — foresatte uten staffRole skal ikke inn i viewerUids
    const role = p.staffRole || (p.superAdmin ? 'principal' : (p.admin ? 'admin' : null));
    const uid = p.uid || d.id;
    if (!uid || p.active === false || p.placeholder || !role) return;
    const any = Object.values(nextAccess).some((acl) => (acl.roles || []).includes(role) || (acl.uids || []).includes(uid));
    if (any) viewerSet.add(uid);
  });
  await setDoc(ref, {
    classroomId,
    studentId,
    studentName: prev.studentName || '',
    access: nextAccess,
    rightsProtectorUids: protectors,
    viewerUids: [...viewerSet],
    updatedAt: serverTimestamp(),
    updatedBy: actorUid || null,
  }, { merge: true });
}

export async function addMapEntry({
  classroomId, studentId, sectionId, title, body, actorUid, actorName, sensitivity,
}) {
  const text = String(body || '').trim();
  const heading = String(title || '').trim();
  if (!heading && !text) throw new Error('Skriv inn innhold.');
  if (!MAP_SECTIONS.some((s) => s.id === sectionId)) throw new Error('Ugyldig seksjon.');
  await ensureStudentMap(classroomId, studentId);
  const ref = await addDoc(
    collection(db, 'classroomMaps', mapDocId(classroomId, studentId), 'entries'),
    {
      sectionId,
      title: heading || null,
      body: text,
      sensitivity: sensitivity || (MAP_SECTIONS.find((s) => s.id === sectionId)?.sensitive ? 'restricted' : 'normal'),
      createdBy: actorUid || null,
      createdByName: actorName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
  await addDoc(
    collection(db, 'classroomMaps', mapDocId(classroomId, studentId), 'audit'),
    {
      action: 'entry_create',
      sectionId,
      entryId: ref.id,
      actorUid: actorUid || null,
      at: serverTimestamp(),
    },
  );
  return ref.id;
}

export async function logMapAccess({ classroomId, studentId, actorUid, sectionId }) {
  if (!classroomId || !studentId || !actorUid) return;
  await addDoc(
    collection(db, 'classroomMaps', mapDocId(classroomId, studentId), 'audit'),
    {
      action: 'view',
      sectionId: sectionId || null,
      actorUid,
      at: serverTimestamp(),
    },
  );
}

export function listenMapAudit(classroomId, studentId, cb) {
  if (!classroomId || !studentId) { cb([]); return () => {}; }
  const qy = query(
    collection(db, 'classroomMaps', mapDocId(classroomId, studentId), 'audit'),
    orderBy('at', 'desc'),
    limit(50),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export { mapDocId };

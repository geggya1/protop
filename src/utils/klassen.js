/**
 * Familien sin «Klassen»-app — klasseinfo, kontaktliste, foreldremøter og lærerchat.
 * Firestore: families/{familyId}/klassen/{classId} (+ contacts, meetings)
 */
import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { ensureChatDoc } from './chats';
import { pickDocument, uploadFile } from './media';
import {
  CONTACT_KINDS,
  CONTACT_KIND_LABELS,
  klassenChatId,
  canManageKlassen,
  normalizePlace,
  classDisplayTitle,
  filterKlassenForChild,
  sortContacts,
  tsMs,
} from './klassenLogic.js';

export {
  CONTACT_KINDS,
  CONTACT_KIND_LABELS,
  klassenChatId,
  canManageKlassen,
  normalizePlace,
  classDisplayTitle,
  filterKlassenForChild,
  sortContacts,
};

export function klassenCol(familyId) {
  return collection(db, 'families', familyId, 'klassen');
}

export function klassenDoc(familyId, classId) {
  return doc(db, 'families', familyId, 'klassen', classId);
}

export function contactsCol(familyId, classId) {
  return collection(db, 'families', familyId, 'klassen', classId, 'contacts');
}

export function meetingsCol(familyId, classId) {
  return collection(db, 'families', familyId, 'klassen', classId, 'meetings');
}

export function listenKlassen(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(klassenCol(familyId), (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((k) => !k.deleted)
      .sort((a, b) => tsMs(b.updatedAt || b.createdAt) - tsMs(a.updatedAt || a.createdAt));
    cb(rows);
  }, () => cb([]));
}

export function listenKlassenClass(familyId, classId, cb) {
  if (!familyId || !classId) return () => {};
  return onSnapshot(klassenDoc(familyId, classId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

export function listenKlassenContacts(familyId, classId, cb) {
  if (!familyId || !classId) return () => {};
  return onSnapshot(contactsCol(familyId, classId), (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => !c.deleted);
    cb(sortContacts(rows));
  }, () => cb([]));
}

export function listenKlassenMeetings(familyId, classId, cb) {
  if (!familyId || !classId) return () => {};
  return onSnapshot(meetingsCol(familyId, classId), (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => !m.deleted)
      .sort((a, b) => String(b.dateKey || '').localeCompare(String(a.dateKey || ''))
        || tsMs(b.createdAt) - tsMs(a.createdAt));
    cb(rows);
  }, () => cb([]));
}

export async function createKlassenClass(familyId, {
  name,
  schoolName,
  place = null,
  childIds = [],
  memberIds = [],
  createdBy,
} = {}) {
  if (!familyId) throw new Error('Mangler familie');
  const className = String(name || '').trim();
  if (!className) throw new Error('Skriv inn klassenavn');
  const school = String(schoolName || '').trim();
  if (!school) throw new Error('Skriv inn skolenavn');

  const payload = {
    name: className,
    schoolName: school,
    place: normalizePlace(place),
    childIds: Array.isArray(childIds) ? childIds.filter(Boolean) : [],
    memberIds: Array.isArray(memberIds) ? memberIds.filter(Boolean) : [],
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
  };

  const refDoc = await addDoc(klassenCol(familyId), payload);
  const chatId = klassenChatId(refDoc.id);
  await updateDoc(refDoc, { chatId, updatedAt: serverTimestamp() });

  try {
    await ensureChatDoc(familyId, chatId, {
      type: 'group',
      title: `Klassen ${className}`,
      memberIds: payload.memberIds,
    });
  } catch {
    // Chat opprettes ved første melding hvis dette feiler
  }

  return refDoc.id;
}

export async function updateKlassenClass(familyId, classId, patch = {}) {
  if (!familyId || !classId) return;
  const next = { updatedAt: serverTimestamp() };
  if (patch.name != null) next.name = String(patch.name).trim();
  if (patch.schoolName != null) next.schoolName = String(patch.schoolName).trim();
  if (patch.place !== undefined) next.place = normalizePlace(patch.place);
  if (Array.isArray(patch.childIds)) next.childIds = patch.childIds.filter(Boolean);
  if (Array.isArray(patch.memberIds)) next.memberIds = patch.memberIds.filter(Boolean);
  await updateDoc(klassenDoc(familyId, classId), next);

  if (next.name || next.memberIds) {
    try {
      await ensureChatDoc(familyId, klassenChatId(classId), {
        type: 'group',
        title: `Klassen ${next.name || 'klasse'}`,
        memberIds: next.memberIds || [],
      });
    } catch {
      // ignore
    }
  }
}

export async function deleteKlassenClass(familyId, classId) {
  if (!familyId || !classId) return;
  await updateDoc(klassenDoc(familyId, classId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function addKlassenContact(familyId, classId, data = {}) {
  if (!familyId || !classId) throw new Error('Mangler klasse');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Skriv inn navn');
  const kind = CONTACT_KINDS[data.kind] || CONTACT_KINDS.guardian;
  const payload = {
    kind,
    name,
    phone: String(data.phone || '').trim() || null,
    email: String(data.email || '').trim() || null,
    notes: String(data.notes || '').trim() || null,
    roleTitle: String(data.roleTitle || '').trim() || null,
    linkedStudentName: String(data.linkedStudentName || '').trim() || null,
    createdBy: data.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
  };
  const refDoc = await addDoc(contactsCol(familyId, classId), payload);
  return refDoc.id;
}

export async function updateKlassenContact(familyId, classId, contactId, patch = {}) {
  if (!familyId || !classId || !contactId) return;
  const next = { updatedAt: serverTimestamp() };
  ['name', 'phone', 'email', 'notes', 'roleTitle', 'linkedStudentName'].forEach((key) => {
    if (patch[key] !== undefined) {
      const val = String(patch[key] || '').trim();
      next[key] = val || null;
    }
  });
  if (patch.kind && CONTACT_KINDS[patch.kind]) next.kind = patch.kind;
  await updateDoc(doc(contactsCol(familyId, classId), contactId), next);
}

export async function deleteKlassenContact(familyId, classId, contactId) {
  if (!familyId || !classId || !contactId) return;
  await updateDoc(doc(contactsCol(familyId, classId), contactId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function addKlassenMeeting(familyId, classId, data = {}) {
  if (!familyId || !classId) throw new Error('Mangler klasse');
  const title = String(data.title || '').trim() || 'Foreldremøte';
  const payload = {
    title,
    dateKey: data.dateKey || null,
    notes: String(data.notes || '').trim() || null,
    files: Array.isArray(data.files) ? data.files : [],
    createdBy: data.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deleted: false,
  };
  const refDoc = await addDoc(meetingsCol(familyId, classId), payload);
  return refDoc.id;
}

export async function updateKlassenMeeting(familyId, classId, meetingId, patch = {}) {
  if (!familyId || !classId || !meetingId) return;
  const next = { updatedAt: serverTimestamp() };
  if (patch.title != null) next.title = String(patch.title).trim() || 'Foreldremøte';
  if (patch.dateKey !== undefined) next.dateKey = patch.dateKey || null;
  if (patch.notes !== undefined) next.notes = String(patch.notes || '').trim() || null;
  if (Array.isArray(patch.files)) next.files = patch.files;
  await updateDoc(doc(meetingsCol(familyId, classId), meetingId), next);
}

export async function deleteKlassenMeeting(familyId, classId, meetingId) {
  if (!familyId || !classId || !meetingId) return;
  await updateDoc(doc(meetingsCol(familyId, classId), meetingId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function uploadKlassenMeetingFile({ familyId, classId, meetingId, picked, uploadedBy }) {
  if (!familyId || !classId || !picked) throw new Error('Mangler fil');
  const safeName = String(picked.name || 'dokument').replace(/[^\w.\-æøåÆØÅ ]+/gi, '_').slice(0, 120);
  const path = `families/${familyId}/klassen/${classId}/meetings/${meetingId || 'new'}/${Date.now()}_${safeName}`;
  const downloadUrl = await uploadFile(path, picked, picked.mimeType);
  return {
    name: safeName,
    mimeType: picked.mimeType || 'application/octet-stream',
    size: picked.size || null,
    storagePath: path,
    downloadUrl,
    uploadedBy: uploadedBy || null,
    uploadedAtMs: Date.now(),
  };
}

export { pickDocument };

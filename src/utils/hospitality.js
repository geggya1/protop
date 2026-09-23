/**
 * Client Firestore API for hospitality / short-term rental module.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDocs,
  onSnapshot, serverTimestamp, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import {
  CHANNELS,
  DEFAULT_MESSAGE_TEMPLATES,
  RESERVATION_STATUS,
} from './hospitalityLogic.js';

export {
  CHANNELS,
  DEFAULT_MESSAGE_TEMPLATES,
  RESERVATION_STATUS,
} from './hospitalityLogic.js';

export * from './hospitalityLogic.js';

function propsCol(familyId) {
  return collection(db, 'families', familyId, 'hospProperties');
}
function resCol(familyId) {
  return collection(db, 'families', familyId, 'hospReservations');
}
function tplCol(familyId) {
  return collection(db, 'families', familyId, 'hospMessageTemplates');
}
function reviewCol(familyId) {
  return collection(db, 'families', familyId, 'hospReviews');
}
function msgLogCol(familyId) {
  return collection(db, 'families', familyId, 'hospMessageLog');
}
function channelsCol(familyId) {
  return collection(db, 'families', familyId, 'hospChannels');
}
function locksCol(familyId) {
  return collection(db, 'families', familyId, 'hospLocks');
}

function mapDoc(d) {
  return { id: d.id, ...(d.data() || {}) };
}

export function listenProperties(familyId, cb) {
  if (!familyId) return () => {};
  const q = query(propsCol(familyId), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenReservations(familyId, cb) {
  if (!familyId) return () => {};
  const q = query(resCol(familyId), orderBy('checkIn', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenMessageTemplates(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(tplCol(familyId), (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenReviews(familyId, cb) {
  if (!familyId) return () => {};
  const q = query(reviewCol(familyId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenChannels(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(channelsCol(familyId), (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenLocks(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(locksCol(familyId), (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export function listenMessageLog(familyId, cb) {
  if (!familyId) return () => {};
  const q = query(msgLogCol(familyId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(mapDoc)), () => cb([]));
}

export async function createProperty(familyId, uid, data) {
  return addDoc(propsCol(familyId), {
    name: String(data.name || '').trim() || 'Uten navn',
    address: String(data.address || '').trim(),
    timezone: data.timezone || 'Europe/Oslo',
    checkInTime: data.checkInTime || '15:00',
    checkOutTime: data.checkOutTime || '11:00',
    checkInInstructions: String(data.checkInInstructions || '').trim(),
    checkOutInstructions: String(data.checkOutInstructions || '').trim(),
    wifiName: String(data.wifiName || '').trim(),
    wifiPassword: String(data.wifiPassword || '').trim(),
    nukiSmartlockId: data.nukiSmartlockId || null,
    lockEarlyHours: Number(data.lockEarlyHours) || 0,
    lockLateHours: Number(data.lockLateHours) || 0,
    active: data.active !== false,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateProperty(familyId, propertyId, patch) {
  return updateDoc(doc(db, 'families', familyId, 'hospProperties', propertyId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProperty(familyId, propertyId) {
  return deleteDoc(doc(db, 'families', familyId, 'hospProperties', propertyId));
}

export async function createReservation(familyId, uid, data) {
  return addDoc(resCol(familyId), {
    propertyId: data.propertyId || null,
    propertyName: data.propertyName || '',
    channel: data.channel || CHANNELS.manual,
    externalId: data.externalId || null,
    sourceId: data.sourceId || null,
    guestName: String(data.guestName || '').trim() || 'Gjest',
    guestEmail: String(data.guestEmail || '').trim(),
    guestPhone: String(data.guestPhone || '').trim(),
    guestCount: Number(data.guestCount) || 1,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    status: data.status || RESERVATION_STATUS.confirmed,
    notes: String(data.notes || '').trim(),
    lockCode: data.lockCode || null,
    lockAuthId: data.lockAuthId || null,
    confirmedAt: serverTimestamp(),
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateReservation(familyId, reservationId, patch) {
  return updateDoc(doc(db, 'families', familyId, 'hospReservations', reservationId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReservation(familyId, reservationId) {
  return deleteDoc(doc(db, 'families', familyId, 'hospReservations', reservationId));
}

export async function ensureDefaultTemplates(familyId, uid) {
  const snap = await getDocs(tplCol(familyId));
  if (!snap.empty) return snap.docs.map(mapDoc);
  const batch = writeBatch(db);
  const created = [];
  for (const tpl of DEFAULT_MESSAGE_TEMPLATES) {
    const ref = doc(tplCol(familyId));
    const data = {
      ...tpl,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(ref, data);
    created.push({ id: ref.id, ...tpl });
  }
  await batch.commit();
  return created;
}

export async function upsertMessageTemplate(familyId, uid, template) {
  if (template.id) {
    const { id, ...rest } = template;
    await updateDoc(doc(db, 'families', familyId, 'hospMessageTemplates', id), {
      ...rest,
      updatedAt: serverTimestamp(),
    });
    return id;
  }
  const ref = await addDoc(tplCol(familyId), {
    ...template,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteMessageTemplate(familyId, templateId) {
  return deleteDoc(doc(db, 'families', familyId, 'hospMessageTemplates', templateId));
}

export async function createReview(familyId, uid, data) {
  return addDoc(reviewCol(familyId), {
    propertyId: data.propertyId || null,
    reservationId: data.reservationId || null,
    channel: data.channel || CHANNELS.manual,
    guestName: String(data.guestName || '').trim(),
    score: Math.max(0, Math.min(5, Number(data.score) || 0)),
    text: String(data.text || '').trim(),
    replied: !!data.replied,
    replyText: String(data.replyText || '').trim(),
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateReview(familyId, reviewId, patch) {
  return updateDoc(doc(db, 'families', familyId, 'hospReviews', reviewId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function saveChannelConnection(familyId, uid, data) {
  const id = data.id || data.type;
  const ref = doc(db, 'families', familyId, 'hospChannels', id);
  await setDoc(ref, {
    type: data.type,
    label: data.label || data.type,
    icalUrl: data.icalUrl || '',
    propertyId: data.propertyId || null,
    partnerAccountId: data.partnerAccountId || '',
    oauthConnected: !!data.oauthConnected,
    connected: !!(data.icalUrl || data.partnerAccountId || data.oauthConnected || data.connected),
    notes: data.notes || '',
    lastSyncAt: data.lastSyncAt || null,
    lastError: data.lastError || null,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function deleteChannelConnection(familyId, channelId) {
  return deleteDoc(doc(db, 'families', familyId, 'hospChannels', channelId));
}

/** Callables */
export async function saveNukiToken(familyId, apiToken) {
  const fn = httpsCallable(functions, 'hospSaveNukiToken');
  return (await fn({ familyId, apiToken })).data;
}

export async function getNukiStatus(familyId) {
  const fn = httpsCallable(functions, 'hospGetNukiStatus');
  return (await fn({ familyId })).data;
}

export async function syncNukiLocks(familyId) {
  const fn = httpsCallable(functions, 'hospSyncNukiLocks');
  return (await fn({ familyId })).data;
}

export async function disconnectNuki(familyId) {
  const fn = httpsCallable(functions, 'hospDisconnectNuki');
  return (await fn({ familyId })).data;
}

export async function provisionLockCode(familyId, reservationId) {
  const fn = httpsCallable(functions, 'hospProvisionLockCode');
  return (await fn({ familyId, reservationId })).data;
}

export async function revokeLockCode(familyId, reservationId) {
  const fn = httpsCallable(functions, 'hospRevokeLockCode');
  return (await fn({ familyId, reservationId })).data;
}

export async function syncChannelIcal(familyId, channelId) {
  const fn = httpsCallable(functions, 'hospSyncChannelIcal');
  return (await fn({ familyId, channelId })).data;
}

export async function syncAllChannels(familyId) {
  const fn = httpsCallable(functions, 'hospSyncAllChannels');
  return (await fn({ familyId })).data;
}

export async function processAutomessages(familyId) {
  const fn = httpsCallable(functions, 'hospProcessAutomessages');
  return (await fn({ familyId })).data;
}

export async function generateReplyDraft(familyId, { reviewId, messageText, tone } = {}) {
  const fn = httpsCallable(functions, 'hospGenerateReplyDraft');
  return (await fn({ familyId, reviewId, messageText, tone })).data;
}

export async function getHospitalityLoginChecklist(familyId) {
  const fn = httpsCallable(functions, 'hospLoginChecklist');
  return (await fn({ familyId })).data;
}

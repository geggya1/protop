/**
 * Kjøretøy og ting i boligen (tidligere «Hjem & eiendeler»).
 * Bolig ligger i Boligen. kind=home ignoreres i UI.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { cleanVehicleLogs, cleanHoldingDocuments } from './familyHoldingsLogic.js';

export {
  HOLDING_KINDS,
  VEHICLE_TYPES,
  VEHICLE_FUELS,
  VEHICLE_LOG_KINDS,
  HOLDING_DOC_KINDS,
  HOLDINGS_HUB_BLURB,
  vehicleFormConfig,
  isVehicleHolding,
  isHomeItemHolding,
  vehicleTypeMeta,
  dueTone,
  vehicleDeadlines,
  vehicleLogTotal,
  vehicleSummaryLine,
  cleanHoldingDocuments,
} from './familyHoldingsLogic.js';

export function holdingsCol(familyId) {
  return collection(db, 'families', familyId, 'holdings');
}

export function holdingDoc(familyId, holdingId) {
  return doc(db, 'families', familyId, 'holdings', holdingId);
}

export function listenHoldings(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(holdingsCol(familyId), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((h) => h.deleted !== true)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'nb'));
    cb(list);
  }, () => cb([]));
}

export async function saveHolding(familyId, holdingId, payload, uid) {
  if (!familyId) throw new Error('Mangler familyId');
  const body = {
    title: String(payload.title || '').trim() || 'Eiendel',
    kind: payload.kind || 'item',
    emoji: payload.emoji || '📦',
    notes: String(payload.notes || '').trim(),
    room: String(payload.room || '').trim(),
    documentFolderId: payload.documentFolderId || null,
    nextServiceKey: payload.nextServiceKey || null,
    valueEstimate: payload.valueEstimate != null ? Number(payload.valueEstimate) : null,
    make: String(payload.make || '').trim(),
    model: String(payload.model || '').trim(),
    year: payload.year ? String(payload.year).trim() : '',
    regNumber: (() => {
      const raw = String(payload.regNumber || '').trim();
      const plateLike = ['car', 'van', 'motorcycle', 'moped', 'trailer'].includes(payload.vehicleType);
      return plateLike ? raw.toUpperCase().replace(/\s+/g, '') : raw;
    })(),
    understellsnummer: String(payload.understellsnummer || '').trim().toUpperCase(),
    fuelType: payload.fuelType || '',
    mileageKm: payload.mileageKm != null && payload.mileageKm !== ''
      ? Number(payload.mileageKm)
      : null,
    insuranceKey: payload.insuranceKey || null,
    euControlKey: payload.euControlKey || null,
    lastServiceKey: payload.lastServiceKey || null,
    tireNote: String(payload.tireNote || '').trim(),
    vehicleType: payload.vehicleType || (payload.kind === 'vehicle' ? 'car' : ''),
    insuranceCompany: String(payload.insuranceCompany || '').trim(),
    purchaseKey: payload.purchaseKey || null,
    vegvesenSyncedAt: payload.vegvesenSyncedAt || null,
    logs: cleanVehicleLogs(payload.logs),
    documents: cleanHoldingDocuments(payload.documents),
    photoUrl: payload.photoUrl ? String(payload.photoUrl).trim() : null,
    photoPath: payload.photoPath ? String(payload.photoPath).trim() : null,
    roomId: payload.roomId ? String(payload.roomId).trim() : null,
    boligId: payload.boligId ? String(payload.boligId).trim() : null,
    linkedEntryId: payload.linkedEntryId ? String(payload.linkedEntryId).trim() : null,
    warrantyUntil: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.warrantyUntil || '').trim())
      ? String(payload.warrantyUntil).trim()
      : null,
    updatedAt: serverTimestamp(),
  };
  if (holdingId) {
    await updateDoc(holdingDoc(familyId, holdingId), body);
    return holdingId;
  }
  const ref = await addDoc(holdingsCol(familyId), {
    ...body,
    createdBy: uid || null,
    deleted: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function archiveHolding(familyId, holdingId) {
  if (!familyId || !holdingId) return;
  await updateDoc(holdingDoc(familyId, holdingId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

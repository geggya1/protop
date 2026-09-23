/**
 * Skrapekart — markér besøkte land med familiemedlemmer, bilde, kommentar, år og periode.
 */
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  PERIODS,
  PERIOD_BY_ID,
  periodLabel,
  visitTitle,
  buildScratchStats,
  emptyVisitForm,
  placeDisplayName,
  visitPlaceKey,
  mapPlacesForCountry,
  visitYearLabel,
  normalizeMemberIds,
  assertValidVisitInput,
} from './scratchMapLogic.js';

export {
  PERIODS,
  PERIOD_BY_ID,
  periodLabel,
  visitTitle,
  buildScratchStats,
  emptyVisitForm,
  placeDisplayName,
  visitPlaceKey,
  visitYearLabel,
  mapPlacesForCountry,
};

function visitsCol(familyId) {
  return collection(db, 'families', familyId, 'scratchMapVisits');
}

function visitDoc(familyId, visitId) {
  return doc(db, 'families', familyId, 'scratchMapVisits', visitId);
}

function mapDoc(d) {
  return { id: d.id, ...(d.data() || {}) };
}

export function listenScratchVisits(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(
    visitsCol(familyId),
    (snap) => {
      const rows = snap.docs
        .map(mapDoc)
        .filter((v) => v.deleted !== true)
        .sort((a, b) => {
          const ya = Number(a.year);
          const yb = Number(b.year);
          const aValid = Number.isFinite(ya);
          const bValid = Number.isFinite(yb);
          if (aValid && bValid && yb !== ya) return yb - ya;
          if (aValid && !bValid) return -1;
          if (!aValid && bValid) return 1;
          const ta = a.createdAt?.seconds || a.updatedAt?.seconds || 0;
          const tb = b.createdAt?.seconds || b.updatedAt?.seconds || 0;
          return tb - ta;
        });
      cb(rows);
    },
    () => cb([]),
  );
}

export async function createScratchVisit(familyId, uid, data) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const { code, year, period, partId, placeKey } = assertValidVisitInput(data);

  return addDoc(visitsCol(familyId), {
    countryCode: code,
    partId,
    placeKey,
    memberIds: normalizeMemberIds(data.memberIds),
    year,
    period,
    periodNote: String(data.periodNote || '').trim().slice(0, 80),
    comment: String(data.comment || '').trim().slice(0, 2000),
    imageUrl: data.imageUrl || null,
    createdBy: uid,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateScratchVisit(familyId, visitId, patch) {
  if (!familyId || !visitId) throw new Error('Mangler besøk.');
  const next = { updatedAt: serverTimestamp() };

  if (patch.countryCode != null || patch.partId != null || patch.placeKey != null) {
    const { code, partId, placeKey } = assertValidVisitInput({
      countryCode: patch.countryCode ?? 'NO',
      year: patch.year ?? 2000,
      skipYear: patch.skipYear ?? patch.year == null,
      period: patch.period || 'summer',
      partId: patch.partId,
      placeKey: patch.placeKey,
    });
    if (patch.countryCode != null) next.countryCode = code;
    next.partId = partId;
    next.placeKey = placeKey;
  }
  if ('year' in patch || 'skipYear' in patch) {
    if (patch.skipYear || patch.year == null || patch.year === '') {
      next.year = null;
    } else {
      const year = Number(patch.year);
      if (!Number.isFinite(year) || year < 1900 || year > 2100) {
        throw new Error('Oppgi et gyldig år.');
      }
      next.year = year;
    }
  }
  if (patch.period != null) {
    if (!PERIOD_BY_ID[patch.period]) throw new Error('Ugyldig periode.');
    next.period = patch.period;
  }
  if (patch.memberIds != null) next.memberIds = normalizeMemberIds(patch.memberIds);
  if (patch.periodNote != null) next.periodNote = String(patch.periodNote).trim().slice(0, 80);
  if (patch.comment != null) next.comment = String(patch.comment).trim().slice(0, 2000);
  if (patch.imageUrl !== undefined) next.imageUrl = patch.imageUrl || null;
  return updateDoc(visitDoc(familyId, visitId), next);
}

export async function deleteScratchVisit(familyId, visitId) {
  if (!familyId || !visitId) return;
  try {
    await updateDoc(visitDoc(familyId, visitId), {
      deleted: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    await deleteDoc(visitDoc(familyId, visitId));
  }
}

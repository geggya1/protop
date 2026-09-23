/**
 * Boligen — familiens registrerte hjem (rom, papirer, håndverkere).
 * Firestore: families/{familyId}/boligmapper/{id}
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  formatMatrikkelnummer,
  BOLIG_DOC_KINDS,
  CONTRACTOR_SERVICES,
  boligSummaryLine,
} from './boligmappaApis';
import { cleanBoligEntries } from './boligPaper.js';
import { cleanIssues, cleanSystems, cleanTasks } from './boligCare.js';

export { BOLIG_DOC_KINDS, CONTRACTOR_SERVICES, boligSummaryLine, cleanBoligEntries };

export function boligmapperCol(familyId) {
  return collection(db, 'families', familyId, 'boligmapper');
}

export function boligmappeDoc(familyId, boligId) {
  return doc(db, 'families', familyId, 'boligmapper', boligId);
}

function cleanRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  return rooms
    .map((r) => ({
      id: String(r?.id || '').trim() || `room_${Math.random().toString(36).slice(2, 8)}`,
      name: String(r?.name || '').trim(),
      notes: String(r?.notes || '').trim(),
    }))
    .filter((r) => r.name);
}

function cleanContractors(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({
      id: String(c?.id || '').trim() || `c_${Math.random().toString(36).slice(2, 8)}`,
      name: String(c?.name || '').trim(),
      organisasjonsnummer: String(c?.organisasjonsnummer || '').replace(/\D/g, ''),
      role: String(c?.role || '').trim(),
      services: Array.isArray(c?.services)
        ? c.services.map((s) => String(s || '').trim()).filter(Boolean)
        : (c?.role ? [String(c.role).trim()].filter(Boolean) : []),
      workNotes: String(c?.workNotes || '').trim(),
      phone: String(c?.phone || '').trim(),
      email: String(c?.email || '').trim(),
      notes: String(c?.notes || '').trim(),
      source: c?.source || 'manual',
    }))
    .filter((c) => c.name || c.organisasjonsnummer);
}

export function listenBoligmapper(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(boligmapperCol(familyId), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.deleted !== true)
      .sort((a, b) => String(a.title || a.adressetekst || '').localeCompare(
        String(b.title || b.adressetekst || ''),
        'nb',
      ));
    cb(list);
  }, () => cb([]));
}

export async function saveBoligmappe(familyId, boligId, payload, uid) {
  if (!familyId) throw new Error('Mangler familyId');
  const matrikkel = payload.matrikkel || {};
  const body = {
    title: String(payload.title || payload.adressetekst || '').trim() || 'Bolig',
    adressetekst: String(payload.adressetekst || '').trim(),
    postnummer: String(payload.postnummer || '').trim(),
    poststed: String(payload.poststed || '').trim(),
    label: String(payload.label || '').trim(),
    notes: String(payload.notes || '').trim(),
    photoUrl: payload.photoUrl ? String(payload.photoUrl).trim() : null,
    photoPath: payload.photoPath ? String(payload.photoPath).trim() : null,
    documentFolderId: payload.documentFolderId || null,
    matrikkel: {
      kommunenummer: String(matrikkel.kommunenummer || '').trim(),
      kommunenavn: String(matrikkel.kommunenavn || '').trim(),
      gardsnummer: matrikkel.gardsnummer != null ? Number(matrikkel.gardsnummer) : null,
      bruksnummer: matrikkel.bruksnummer != null ? Number(matrikkel.bruksnummer) : null,
      festenummer: matrikkel.festenummer != null ? Number(matrikkel.festenummer) : 0,
      seksjonsnummer: matrikkel.seksjonsnummer != null ? Number(matrikkel.seksjonsnummer) : 0,
    },
    matrikkelnummertekst: String(
      payload.matrikkelnummertekst
      || formatMatrikkelnummer(matrikkel)
      || '',
    ).trim(),
    bruksenhetsnummer: Array.isArray(payload.bruksenhetsnummer)
      ? payload.bruksenhetsnummer.map(String).filter(Boolean)
      : [],
    lat: payload.lat != null ? Number(payload.lat) : null,
    lon: payload.lon != null ? Number(payload.lon) : null,
    rooms: cleanRooms(payload.rooms),
    contractors: cleanContractors(payload.contractors),
    entries: cleanBoligEntries(payload.entries),
    sources: {
      kartverket: true,
      brreg: Array.isArray(payload.contractors) && payload.contractors.some((c) => c?.source === 'brreg'),
      ...(payload.sources || {}),
    },
    updatedAt: serverTimestamp(),
  };
  if ('tasks' in (payload || {})) body.tasks = cleanTasks(payload.tasks);
  if ('issues' in (payload || {})) body.issues = cleanIssues(payload.issues);
  if ('systems' in (payload || {})) body.systems = cleanSystems(payload.systems);
  if (payload?.carePingId) body.carePingId = String(payload.carePingId);

  if (boligId) {
    await updateDoc(boligmappeDoc(familyId, boligId), body);
    return boligId;
  }
  const ref = await addDoc(boligmapperCol(familyId), {
    ...body,
    createdBy: uid || null,
    deleted: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function markBoligCarePing(familyId, boligId, carePingId) {
  if (!familyId || !boligId || !carePingId) return;
  await updateDoc(boligmappeDoc(familyId, boligId), {
    carePingId: String(carePingId),
    updatedAt: serverTimestamp(),
  });
}

export async function archiveBoligmappe(familyId, boligId) {
  if (!familyId || !boligId) return;
  await updateDoc(boligmappeDoc(familyId, boligId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

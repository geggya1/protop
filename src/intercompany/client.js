/**
 * Konsernintegrasjon i appen: les avtalene i sanntid og kall serveren for alt som endrer dem.
 * Avtalene skrives bare av serveren (functions/intercompany.js), så det andre selskapet alltid
 * har godkjent tilknytningen.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { normalizeLink } from './model.js';

function errorText(error, fallback) {
  const raw = String(error?.message || '').replace(/^FirebaseError:\s*/, '').trim();
  if (!raw || /^internal$/i.test(raw)) return fallback;
  return raw;
}

async function call(name, data, fallback) {
  try {
    const res = await httpsCallable(functions, name)(data);
    const out = res?.data || {};
    if (out.ok === false) throw new Error(out.message || fallback);
    return out;
  } catch (error) {
    throw new Error(errorText(error, fallback));
  }
}

export function requestLink({ companyId, orgnr = '', targetCompanyId = '', role = 'child', settings = {}, message = '', actorName = '' }) {
  return call('icRequestLink', { companyId, orgnr, targetCompanyId, role, settings, message, actorName }, 'Kunne ikke sende forespørselen.');
}

export function respondLink({ companyId, linkId, accept, actorName = '' }) {
  return call('icRespondLink', { companyId, linkId, accept: !!accept, actorName }, 'Kunne ikke svare på forespørselen.');
}

export function withdrawLinkRequest({ companyId, linkId }) {
  return call('icWithdrawLink', { companyId, linkId }, 'Kunne ikke trekke tilbake forespørselen.');
}

export function endLinkAgreement({ companyId, linkId }) {
  return call('icEndLink', { companyId, linkId }, 'Kunne ikke avslutte avtalen.');
}

/** Nye priser: i en aktiv avtale blir det et forslag som det andre selskapet må godta. */
export function saveLinkSettings({ companyId, linkId, settings }) {
  return call('icUpdateLinkSettings', { companyId, linkId, settings }, 'Kunne ikke lagre prisene.');
}

export function answerLinkSettings({ companyId, linkId, accept }) {
  return call('icAnswerLinkSettings', { companyId, linkId, accept: !!accept }, 'Kunne ikke svare på prisforslaget.');
}

/** Morselskapet fordeler nummerserier i konsernet: assignments = { companyId: { project, customer } }. */
export function setNumberSeries({ companyId, assignments }) {
  return call('icSetNumberSeries', { companyId, assignments }, 'Kunne ikke lagre nummerseriene.');
}

export function listPartnerEmployees({ companyId, linkId }) {
  return call('icListPartnerEmployees', { companyId, linkId }, 'Kunne ikke hente medarbeiderne.');
}

export function allocateMembers({ companyId, linkId, projectId, employeeIds, role = '' }) {
  return call('icAllocateMembers', { companyId, linkId, projectId, employeeIds, role }, 'Kunne ikke tildele medarbeiderne.');
}

export function removeAllocatedMember({ companyId, linkId, projectId, supplierEmployeeId }) {
  return call('icRemoveMember', { companyId, linkId, projectId, supplierEmployeeId }, 'Kunne ikke fjerne medarbeideren.');
}

/**
 * Avtalene der selskapet er mor eller datter, i sanntid. onData(liste) kalles når en av
 * de to spørringene endres. Returnerer en funksjon som stopper lyttingen.
 */
export function watchLinks(companyId, onData, onError) {
  const id = String(companyId || '').trim();
  if (!id) {
    onData([]);
    return () => {};
  }
  let stop = false;
  const unsubs = [];
  const parts = { parent: [], child: [] };
  const emit = () => {
    if (stop) return;
    const byId = new Map();
    for (const row of [...parts.parent, ...parts.child]) byId.set(row.id, row);
    onData([...byId.values()]);
  };
  (async () => {
    const [{ collection, onSnapshot, query, where }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('../../firebase.js'),
    ]);
    if (stop) return;
    for (const field of ['parent', 'child']) {
      const q = query(collection(db, 'intercompanyLinks'), where(`${field}CompanyId`, '==', id));
      unsubs.push(onSnapshot(q, (snap) => {
        parts[field] = snap.docs.map((doc) => normalizeLink(doc.data(), doc.id));
        emit();
      }, (error) => {
        if (!stop) onError?.(error);
      }));
    }
  })().catch((error) => {
    if (!stop) onError?.(error);
  });
  return () => {
    stop = true;
    unsubs.forEach((unsub) => unsub?.());
  };
}

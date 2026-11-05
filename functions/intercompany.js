/**
 * Konsernintegrasjon mellom selskaper i ProTop (se src/intercompany/model.js).
 *
 * Avtalene ligger i intercompanyLinks/{linkId}. Begge selskapene kan lese, bare serveren
 * skriver. Tildelinger på prosjekt ligger i intercompanyLinks/{linkId}/projects/{eierens prosjekt-id}.
 *
 * Kall (alle krever innlogging og rettighet i eget selskap):
 * - icRequestLink: be om tilknytning (som mor eller datter). Det andre selskapet må godta.
 * - icRespondLink, icWithdrawLink, icEndLink, icUpdateLinkSettings.
 * - icListPartnerEmployees: partnerens ansatte som kan tildeles på prosjekt.
 * - icAllocateMembers / icRemoveMember: tildel og fjern på prosjekt (kopi hos leverandøren).
 *
 * Triggere (intercompanyTriggers.js) speiler timer og salg fra kopien til prosjekteier.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  LINK_STATUS,
  buildCloneProject,
  buildLinkRequest,
  cloneRateMissing,
  cloneProjectId,
  deactivateMember,
  answerLinkSettings,
  endLink,
  ensurePartnerCustomer,
  externalEmployeeId,
  isSameCompany,
  externalEmployeeRecord,
  lendableEmployees,
  linkIdFor,
  linkView,
  memberRow,
  normalizeLink,
  openLinkBetween,
  proposeLinkSettings,
  respondToLink,
  roleSentence,
  konsernChildren,
  upsertMember,
  upsertProject,
  withSupplierOnOwnerProject,
  withdrawLink,
} from '../src/intercompany/model.js';
import { companyOrgnr } from '../src/project/orgnrIndex.js';
import { normalizeSeries, seriesConflict } from '../src/intercompany/numberSeries.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import { companyRecipients } from '../src/notifications/audience.js';
import { resolveOrgnrOwner } from './companyJoin.js';
import {
  assertCompanyAccess, assertRateLimit, hashRateKey, isFamilyOwnerOrAdmin, requireAuth,
} from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value) {
  return String(value ?? '').trim();
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function safeDocId(value) {
  const id = text(value);
  if (!id || id.includes('/') || id.length > 200) throw new HttpsError('invalid-argument', 'Ugyldig id.');
  return id;
}

function companyName(data) {
  return text(data?.company?.navn || data?.name) || 'Selskapet';
}

function partyOf(id, data) {
  return { id, name: companyName(data), orgnr: companyOrgnr(data) || digits(data?.orgnr) };
}

function actorName(req) {
  return text(req.data?.actorName) || text(req.auth?.token?.name) || text(req.auth?.token?.email);
}

/** Avtaler styres av den som har Admin på Underenheter (som tannhjulet på siden), eier og administratorer. */
function assertLinkAdmin(companyId, uid) {
  return assertCompanyAccess(db, companyId, uid, {
    resource: 'units', action: 'write', message: 'Bare den som administrerer underenheter, kan endre tilknytninger.',
  });
}

function linkRef(id) {
  return db.doc(`intercompanyLinks/${id}`);
}

function stored(link) {
  // Firestore tåler ikke undefined; JSON-runden fjerner det.
  return JSON.parse(JSON.stringify(link));
}

async function readLink(linkId) {
  const snap = await linkRef(safeDocId(linkId)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
  return normalizeLink(snap.data(), snap.id);
}

async function companyDoc(id) {
  const snap = await db.doc(`families/${safeDocId(id)}`).get();
  const data = snap.exists ? snap.data() || {} : null;
  if (!data || data.deleted === true || data.hiddenFromApp === true) {
    throw new HttpsError('not-found', 'Selskapet finnes ikke.');
  }
  if (!isOrganizationType(data.type)) throw new HttpsError('failed-precondition', 'Bare bedrifter kan knyttes sammen.');
  return data;
}

async function notifyCompany(companyId, { title, body, exclude = [] }) {
  try {
    const family = await companyDoc(companyId);
    const employees = (await db.collection(`families/${companyId}/employees`).get())
      .docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const recipients = companyRecipients({ family, employees, type: 'intercompanyLink', exclude })
      .filter((uid) => isFamilyOwnerOrAdmin(family, uid));
    await Promise.all(recipients.map((uid) => db.collection(`users/${uid}/notifications`).add({
      eventType: 'intercompanyLink',
      title,
      body,
      familyId: companyId,
      createdAt: FieldValue.serverTimestamp(),
      seen: false,
    })));
  } catch (error) {
    logger.warn('intercompany notification failed', { companyId, message: error?.message });
  }
}

/** Morselskapet vises på datterselskapet (som den gamle koblingen), bare mens avtalen er aktiv. */
async function syncParentField(link) {
  // Samarbeidspartnere er ikke i samme konsern.
  if (link.relation === 'partner') return;
  const ref = db.doc(`families/${link.child.id}`);
  if (link.status === LINK_STATUS.active) {
    await ref.set({ parentCompanyId: link.parent.id, parentCompanyName: link.parent.name, parentLinkId: link.id }, { merge: true });
    return;
  }
  const snap = await ref.get();
  if (snap.exists && snap.data()?.parentCompanyId === link.parent.id) {
    await ref.set({ parentCompanyId: '', parentCompanyName: '', parentLinkId: '' }, { merge: true });
  }
}

async function openLinksFor(companyId) {
  const snap = await db.collection('intercompanyLinks').where('companyIds', 'array-contains', companyId).limit(200).get();
  return snap.docs.map((doc) => normalizeLink(doc.data(), doc.id));
}

// ── Avtalen ──────────────────────────────────────────────────────────────

export const icRequestLink = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = safeDocId(req.data?.companyId);
  await assertLinkAdmin(companyId, uid);
  await assertRateLimit(db, { key: hashRateKey(['ic-request', uid]), limit: 20, windowMs: 60 * 60 * 1000 });
  const ownData = await companyDoc(companyId);

  let targetId = text(req.data?.targetCompanyId);
  if (!targetId) {
    const orgnr = digits(req.data?.orgnr);
    if (orgnr.length !== 9) throw new HttpsError('invalid-argument', 'Oppgi et organisasjonsnummer med ni siffer.');
    if (isSameCompany({ id: companyId, ...ownData }, { orgnr })) {
      throw new HttpsError('invalid-argument', 'Et selskap kan ikke knyttes til seg selv.');
    }
    const owner = await resolveOrgnrOwner(db, orgnr, { uid });
    if (!owner?.id) {
      return { ok: false, error: 'not-in-protop', message: 'Selskapet er ikke registrert i ProTop ennå. Det må opprettes før det kan knyttes til.' };
    }
    targetId = owner.id;
  }
  if (targetId === companyId) throw new HttpsError('invalid-argument', 'Et selskap kan ikke knyttes til seg selv.');
  const targetData = await companyDoc(targetId);
  // Samme org.nr., eller underenhet og hovedenhet: det er samme selskap, ikke to.
  if (isSameCompany({ ...ownData, id: companyId }, { ...targetData, id: targetId })) {
    throw new HttpsError('invalid-argument', 'Et selskap kan ikke knyttes til seg selv.');
  }

  const existing = openLinkBetween(await openLinksFor(companyId), companyId, targetId);
  if (existing) return { ok: true, already: true, link: existing };

  const at = new Date().toISOString();
  const id = linkIdFor(companyId, targetId, Date.now());
  const made = buildLinkRequest({
    id,
    requester: partyOf(companyId, ownData),
    target: partyOf(targetId, targetData),
    role: ['parent', 'partner'].includes(req.data?.role) ? req.data.role : 'child',
    uid,
    name: actorName(req),
    message: req.data?.message,
    settings: req.data?.settings || {},
    at,
  });
  if (!made.ok) throw new HttpsError('invalid-argument', made.error);
  let link = made.link;

  // Er den som spør også administrator i det andre selskapet, er forespørselen godkjent der.
  const autoAccept = await assertLinkAdmin(targetId, uid).then(() => true, () => false);
  if (autoAccept) {
    const answered = respondToLink(link, { companyId: targetId, accept: true, uid, name: actorName(req), at });
    if (answered.ok) link = answered.link;
  }
  await linkRef(id).set({ ...stored(link), createdAt: FieldValue.serverTimestamp() });
  if (link.status === LINK_STATUS.active) await syncParentField(link);

  const view = linkView(link, targetId);
  if (!autoAccept) {
    await notifyCompany(targetId, {
      title: 'Forespørsel om tilknytning',
      body: `«${companyName(ownData)}» vil knyttes til dere ${roleSentence(view)}${link.requestedByName ? ` (sendt av ${link.requestedByName})` : ''}. Godta eller avslå under Bedrift → Underenheter.`,
      exclude: [uid],
    });
  }
  return { ok: true, link, autoAccepted: autoAccept };
});

export const icRespondLink = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = safeDocId(req.data?.companyId);
  await assertLinkAdmin(companyId, uid);
  const accept = req.data?.accept === true;
  const at = new Date().toISOString();
  let result = null;
  await db.runTransaction(async (tx) => {
    const ref = linkRef(safeDocId(req.data?.linkId));
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
    // Prisene godtas slik de står. Vil den inviterte endre dem, foreslår den nye priser etterpå.
    const answered = respondToLink(normalizeLink(snap.data(), snap.id), { companyId, accept, uid, name: actorName(req), at });
    if (!answered.ok) throw new HttpsError('failed-precondition', answered.error);
    tx.set(ref, stored(answered.link), { merge: true });
    result = answered.link;
  });
  await syncParentField(result);
  const view = linkView(result, companyId);
  await notifyCompany(view.partner.id, {
    title: accept ? 'Tilknytning godkjent' : 'Tilknytning avslått',
    body: accept
      ? `«${companyName(await companyDoc(companyId))}» godtok tilknytningen. Dere kan nå tildele medarbeidere på hverandres prosjekter.`
      : `«${companyName(await companyDoc(companyId))}» avslo forespørselen om tilknytning.`,
    exclude: [uid],
  });
  return { ok: true, link: result };
});

async function changeLink(req, apply) {
  const uid = requireAuth(req.auth);
  const companyId = safeDocId(req.data?.companyId);
  await assertLinkAdmin(companyId, uid);
  const at = new Date().toISOString();
  let result = null;
  await db.runTransaction(async (tx) => {
    const ref = linkRef(safeDocId(req.data?.linkId));
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
    const changed = apply(normalizeLink(snap.data(), snap.id), { companyId, uid, at });
    if (!changed.ok) throw new HttpsError('failed-precondition', changed.error);
    tx.set(ref, stored(changed.link), { merge: true });
    result = changed.link;
  });
  return { uid, companyId, link: result };
}

export const icWithdrawLink = onCall(CALL, async (req) => {
  const { link } = await changeLink(req, (row, ctx) => withdrawLink(row, ctx));
  return { ok: true, link };
});

export const icEndLink = onCall(CALL, async (req) => {
  const { link, uid, companyId } = await changeLink(req, (row, ctx) => endLink(row, ctx));
  await syncParentField(link);
  const view = linkView(link, companyId);
  // En kobling til selskapet selv har ingen andre å varsle.
  if (!view.self) await notifyCompany(view.partner.id, {
    title: 'Tilknytning avsluttet',
    body: `«${view.parent.id === companyId ? view.parent.name : view.child.name}» avsluttet avtalen. Nye tildelinger stopper; timer som allerede er ført, følger med til godkjenning.`,
    exclude: [uid],
  });
  return { ok: true, link };
});

/** Nye priser: forslag til den andre parten (aktiv avtale), eller justering før svar (egen forespørsel). */
export const icUpdateLinkSettings = onCall(CALL, async (req) => {
  let proposed = false;
  const { link, uid, companyId } = await changeLink(req, (row, ctx) => {
    const out = proposeLinkSettings(row, { ...ctx, settings: req.data?.settings });
    proposed = !!out.proposed;
    return out;
  });
  const view = linkView(link, companyId);
  if (proposed) {
    await notifyCompany(view.partner.id, {
      title: 'Forslag om nye priser',
      body: `«${companyId === link.parent.id ? link.parent.name : link.child.name}» foreslår nye priser i avtalen. Godta eller avslå under Bedrift → Underenheter.`,
      exclude: [uid],
    });
  }
  return { ok: true, link, proposed };
});

/**
 * Svar på forslag om nye standardpriser. De gjelder prosjekter som tildeles etterpå; pris og
 * betingelser på prosjekter som finnes, settes på prosjektet som vanlig.
 */
export const icAnswerLinkSettings = onCall(CALL, async (req) => {
  const accept = req.data?.accept === true;
  const { link, uid, companyId } = await changeLink(req, (row, ctx) => answerLinkSettings(row, { ...ctx, accept }));
  const view = linkView(link, companyId);
  await notifyCompany(view.partner.id, {
    title: accept ? 'Nye priser godtatt' : 'Prisforslaget er avslått',
    body: `Prisene for tilknytningen mellom «${link.parent.name}» og «${link.child.name}» ${accept ? 'er oppdatert' : 'står som før'}.`,
    exclude: [uid],
  });
  return { ok: true, link };
});

// ── Tildeling på prosjekt ─────────────────────────────────────────────────

function stateRef(companyId) {
  return db.doc(`families/${companyId}/projects/state`);
}

function stateOf(snap) {
  const data = snap?.exists ? snap.data() || {} : {};
  const state = data.state && typeof data.state === 'object' ? data.state : data;
  return {
    projects: Array.isArray(state.projects) ? state.projects : [],
    members: Array.isArray(state.members) ? state.members : [],
  };
}

async function activeLinkFor(linkId, companyId) {
  const link = await readLink(linkId);
  const view = linkView(link, companyId);
  if (!view) throw new HttpsError('permission-denied', 'Selskapet er ikke part i avtalen.');
  if (link.status !== LINK_STATUS.active) throw new HttpsError('failed-precondition', 'Avtalen er ikke aktiv.');
  if (view.self) throw new HttpsError('failed-precondition', 'Koblingen går til selskapet selv. Fjern den under Bedrift → Underenheter.');
  return { link, view };
}

export const icListPartnerEmployees = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = safeDocId(req.data?.companyId);
  await assertCompanyAccess(db, companyId, uid, { resource: 'projects', action: 'write', message: 'Du kan ikke tildele medarbeidere på prosjekter.' });
  const { view } = await activeLinkFor(req.data?.linkId, companyId);
  const snap = await db.collection(`families/${view.partner.id}/employees`).get();
  const employees = lendableEmployees(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  // Bare det som trengs for å velge: navn, tittel og bilde.
  return {
    ok: true,
    company: view.partner,
    employees: employees.map(({ id, name, title, photoUrl }) => ({ id, name, title, photoUrl })),
  };
});

async function supplierCustomer(supplierId, owner, link, at) {
  const ref = db.doc(`families/${supplierId}/anbud/customers`);
  let customer = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list = snap.exists && Array.isArray(snap.data()?.customers) ? snap.data().customers : [];
    let max = 0;
    for (const row of list) {
      const n = Number(digits(row?.customerNumber));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const made = ensurePartnerCustomer(list, { owner, link, nextNumber: String(max + 1), at });
    customer = made.customer;
    if (made.changed) tx.set(ref, { customers: stored(made.customers), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return customer;
}

export const icAllocateMembers = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const ownerId = safeDocId(req.data?.companyId);
  await assertCompanyAccess(db, ownerId, uid, { resource: 'projects', action: 'write', message: 'Du kan ikke tildele medarbeidere på prosjekter.' });
  await assertRateLimit(db, { key: hashRateKey(['ic-allocate', uid]), limit: 120, windowMs: 60 * 60 * 1000 });
  const { link, view } = await activeLinkFor(req.data?.linkId, ownerId);
  const projectId = safeDocId(req.data?.projectId);
  const employeeIds = [...new Set((Array.isArray(req.data?.employeeIds) ? req.data.employeeIds : [])
    .map((id) => text(id)).filter(Boolean))].slice(0, 50);
  if (!employeeIds.length) throw new HttpsError('invalid-argument', 'Velg minst én medarbeider.');
  const role = text(req.data?.role).slice(0, 80) || 'Prosjektmedlem';
  const at = new Date().toISOString();

  const ownerData = await companyDoc(ownerId);
  const supplierId = view.partner.id;
  const supplierData = await companyDoc(supplierId);
  const owner = partyOf(ownerId, ownerData);
  const supplier = partyOf(supplierId, supplierData);

  const ownerState = stateOf(await stateRef(ownerId).get());
  const ownerProject = ownerState.projects.find((row) => row?.id === projectId);
  if (!ownerProject) throw new HttpsError('not-found', 'Prosjektet finnes ikke.');
  if (ownerProject.intercompany?.role === 'supplier') {
    throw new HttpsError('failed-precondition', 'Prosjektet er selv en leveranse til et annet selskap. Tildel fra det opprinnelige prosjektet.');
  }

  const employeeSnaps = await Promise.all(employeeIds.map((id) => db.doc(`families/${supplierId}/employees/${safeDocId(id)}`).get()));
  const employees = lendableEmployees(employeeSnaps.filter((snap) => snap.exists).map((snap) => ({ id: snap.id, ...snap.data() })));
  const rawById = new Map(employeeSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
  if (!employees.length) throw new HttpsError('failed-precondition', 'Ingen av de valgte er aktive ansatte i partnerselskapet.');

  const customer = await supplierCustomer(supplierId, owner, link, at);
  const cloneId = cloneProjectId(link.id, ownerProject.id);

  // Kopien og deltakerne hos leverandøren.
  await db.runTransaction(async (tx) => {
    const ref = stateRef(supplierId);
    const state = stateOf(await tx.get(ref));
    const existing = state.projects.find((row) => row?.id === cloneId) || null;
    const clone = buildCloneProject({ link, owner, ownerProject, customer, existing, projects: state.projects, at });
    let members = state.members;
    for (const emp of employees) {
      members = upsertMember(members, memberRow({
        projectId: cloneId,
        employeeId: emp.id,
        employeeName: emp.name,
        photoUrl: emp.photoUrl,
        role,
        uid,
        at,
        existing: members.find((row) => row?.projectId === cloneId && row?.employeeId === emp.id),
        intercompany: { linkId: link.id, ownerCompanyId: ownerId, ownerCompanyName: owner.name },
      }));
    }
    tx.set(ref, { state: { projects: stored(upsertProject(state.projects, clone)), members: stored(members) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  // Innleide medarbeidere og deltakere hos eier.
  const batch = db.batch();
  for (const emp of employees) {
    const id = externalEmployeeId(supplierId, emp.id);
    const ref = db.doc(`families/${ownerId}/employees/${id}`);
    const current = await ref.get();
    const record = externalEmployeeRecord({ link, supplier, employee: rawById.get(emp.id), existing: current.exists ? current.data() : null, at });
    batch.set(ref, stored(record), { merge: true });
  }
  await batch.commit();
  let ownerRows = [];
  let ownerMarked = null;
  await db.runTransaction(async (tx) => {
    const ref = stateRef(ownerId);
    const state = stateOf(await tx.get(ref));
    const project = state.projects.find((row) => row?.id === ownerProject.id);
    if (!project) throw new HttpsError('not-found', 'Prosjektet finnes ikke.');
    let members = state.members;
    for (const emp of employees) {
      const employeeId = externalEmployeeId(supplierId, emp.id);
      members = upsertMember(members, memberRow({
        projectId: project.id,
        employeeId,
        employeeName: emp.name,
        photoUrl: emp.photoUrl,
        role,
        uid,
        at,
        existing: members.find((row) => row?.projectId === project.id && row?.employeeId === employeeId),
        intercompany: { linkId: link.id, companyId: supplierId, companyName: supplier.name, employeeId: emp.id, cloneProjectId: cloneId },
      }));
    }
    const marked = withSupplierOnOwnerProject(project, { link, supplier, cloneId, at });
    ownerRows = members.filter((row) => row?.projectId === project.id && row?.intercompany?.companyId === supplierId);
    ownerMarked = marked;
    tx.set(ref, { state: { projects: stored(upsertProject(state.projects, marked)), members: stored(members) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  await linkRef(link.id).collection('projects').doc(ownerProject.id).set({
    linkId: link.id,
    ownerCompanyId: ownerId,
    ownerCompanyName: owner.name,
    ownerProjectId: ownerProject.id,
    ownerProjectNumber: text(ownerProject.number),
    ownerProjectName: text(ownerProject.name),
    supplierCompanyId: supplierId,
    supplierCompanyName: supplier.name,
    cloneProjectId: cloneId,
    employees: FieldValue.arrayUnion(...employees.map((emp) => emp.id)),
    updatedAt: at,
  }, { merge: true });

  await notifyCompany(supplierId, {
    title: 'Medarbeidere tildelt på prosjekt',
    body: `«${owner.name}» har tildelt ${employees.map((emp) => emp.name).join(', ')} på prosjekt ${text(ownerProject.number)} ${text(ownerProject.name)}. Prosjektet ligger nå hos dere med samme nummer.`,
    exclude: [uid],
  });
  // Radene som ble skrevet hos eier, så appen kan vise dem med en gang (samme id som i skyen).
  return {
    ok: true,
    cloneProjectId: cloneId,
    rateMissing: cloneRateMissing({ settings: link.settings, ownerProject, customer }),
    allocated: employees.map((emp) => ({ id: externalEmployeeId(supplierId, emp.id), name: emp.name })),
    members: stored(ownerRows),
    project: stored(ownerMarked),
  };
});

export const icRemoveMember = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const ownerId = safeDocId(req.data?.companyId);
  await assertCompanyAccess(db, ownerId, uid, { resource: 'projects', action: 'write', message: 'Du kan ikke endre deltakere på prosjekter.' });
  const link = await readLink(req.data?.linkId);
  const view = linkView(link, ownerId);
  if (!view) throw new HttpsError('permission-denied', 'Selskapet er ikke part i avtalen.');
  const projectId = safeDocId(req.data?.projectId);
  const supplierEmployeeId = safeDocId(req.data?.supplierEmployeeId);
  const supplierId = view.partner.id;
  // Bare prosjekteier fjerner, og bare fra en tildeling som finnes på eget prosjekt.
  const alloc = await linkRef(link.id).collection('projects').doc(projectId).get();
  if (!alloc.exists || alloc.data()?.ownerCompanyId !== ownerId || alloc.data()?.supplierCompanyId !== supplierId) {
    throw new HttpsError('not-found', 'Fant ikke tildelingen på prosjektet.');
  }
  const at = new Date().toISOString();
  const cloneId = cloneProjectId(link.id, projectId);
  await db.runTransaction(async (tx) => {
    const ref = stateRef(ownerId);
    const state = stateOf(await tx.get(ref));
    const members = deactivateMember(state.members, { projectId, employeeId: externalEmployeeId(supplierId, supplierEmployeeId), at });
    tx.set(ref, { state: { members: stored(members) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await db.runTransaction(async (tx) => {
    const ref = stateRef(supplierId);
    const state = stateOf(await tx.get(ref));
    const members = deactivateMember(state.members, { projectId: cloneId, employeeId: supplierEmployeeId, at });
    tx.set(ref, { state: { members: stored(members) }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await linkRef(link.id).collection('projects').doc(projectId).set({
    employees: FieldValue.arrayRemove(supplierEmployeeId),
    updatedAt: at,
  }, { merge: true });
  return { ok: true };
});

// ── Nummerserier i konsernet ──────────────────────────────────────────────

/**
 * Morselskapet fordeler prosjekt- og kundenummer mellom selskapene i konsernet (seg selv og
 * datterselskaper med aktiv konsernavtale). Seriene skrives på hvert selskap (numberSeries) og
 * samlet på morselskapet (konsernNumberSeries), så alle ser sin egen og mor ser helheten.
 */
export const icSetNumberSeries = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const parentId = safeDocId(req.data?.companyId);
  await assertLinkAdmin(parentId, uid);
  const parentData = await companyDoc(parentId);
  const links = await openLinksFor(parentId);
  const children = konsernChildren(links, parentId);
  const allowed = new Map([[parentId, companyName(parentData)], ...children.map((row) => [row.id, row.name])]);
  const raw = req.data?.assignments && typeof req.data.assignments === 'object' ? req.data.assignments : {};
  const assignments = {};
  for (const [id, series] of Object.entries(raw)) {
    if (!allowed.has(id)) throw new HttpsError('permission-denied', 'Bare selskaper i konsernet kan få nummerserie herfra.');
    assignments[id] = series;
  }
  const names = Object.fromEntries(allowed);
  const conflict = seriesConflict(assignments, names);
  if (conflict) throw new HttpsError('invalid-argument', conflict);
  const at = new Date().toISOString();
  const batch = db.batch();
  const summary = {};
  for (const id of allowed.keys()) {
    const series = normalizeSeries(assignments[id]);
    summary[id] = { ...series, name: names[id] };
    batch.set(db.doc(`families/${id}`), {
      numberSeries: Object.keys(series).length ? { ...series, setByCompanyId: parentId, setByName: names[parentId], setAt: at } : FieldValue.delete(),
    }, { merge: true });
  }
  batch.set(db.doc(`families/${parentId}`), { konsernNumberSeries: { companies: summary, updatedAt: at, updatedBy: uid } }, { merge: true });
  await batch.commit();
  for (const id of allowed.keys()) {
    if (id === parentId) continue;
    await notifyCompany(id, {
      title: 'Nummerserie fra morselskapet',
      body: `«${names[parentId]}» har satt nummerserier for dere i konsernet. Nye prosjekter og kunder får nummer i serien.`,
      exclude: [uid],
    });
  }
  return { ok: true, companies: summary };
});

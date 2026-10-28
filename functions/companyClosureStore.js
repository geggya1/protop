/**
 * Avslutning, eksport og sletting av en bedrift (GRUNN-03) mot Firestore og Storage.
 * Tar imot db og bucketer, så de samme funksjonene brukes av callables (companyClosure.js),
 * av skriptet scripts/purge-closed-companies.mjs og av emulatortesten. Flyten står i
 * src/privacy/companyClosure.js.
 *
 * companyClosures/{id} har ingen klientregler: bare serveren leser og skriver. Der står
 * avslutningen, fristen og en logg (avsluttet, angret, eksportert, slettet). Etter slettingen
 * blir dokumentet stående som bevis på at sletting er gjort, uten navn.
 */
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { gzipSync } from 'node:zlib';
import {
  CLOSURE_COLLECTION, closureRecord, closureRequestError, companyClosure, companyExportName,
  closureConfirmName, purgeDecision, reopenError,
} from '../src/privacy/companyClosure.js';
import { toPlain } from '../src/privacy/myDataExport.js';

export const EXPORT_FORMAT = 'protop-bedrift';
export const EXPORT_VERSION = 1;
/** Tilgangsspeilet regnes ut på nytt og er ikke bedriftens data. */
const EXPORT_SKIP = new Set(['accessAcl']);
const MAX_EXPORT_DOCS = 150_000;
/** Callable-svaret kan ikke være mye større enn 32 MB (base64 av gzip). */
export const MAX_EXPORT_GZIP_BYTES = 20 * 1024 * 1024;
const PARALLEL = 20;

class ClosureError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

async function mapLimit(items, limit, run) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await run(items[index]);
    }
  });
  await Promise.all(workers);
}

function ownerOrAdmin(family, uid) {
  return !!uid && !!family && (family.ownerUid === uid
    || family.ownerId === uid
    || (Array.isArray(family.adminUids) && family.adminUids.includes(uid)));
}

/** Eier eller administrator i en bedrift som finnes. */
async function loadAdminCompany(db, familyId, uid) {
  const id = text(familyId, 120);
  if (!id || id.includes('/')) throw new ClosureError('invalid-argument', 'Mangler bedrift.');
  const snap = await db.doc(`families/${id}`).get();
  if (!snap.exists) throw new ClosureError('not-found', 'Fant ikke bedriften.');
  const family = snap.data() || {};
  if (!ownerOrAdmin(family, uid)) {
    throw new ClosureError('permission-denied', 'Bare eier eller administrator kan gjøre dette.');
  }
  return { id, ref: snap.ref, family };
}

/** Utstedte fakturaer. Ved tvil ja, så bekreftelsen om regnskapet kreves. */
export async function companyHasAccounting(db, familyId) {
  try {
    const snap = await db.collection(`families/${familyId}/invoices`).where('issuedAt', '>', '').limit(1).get();
    return !snap.empty;
  } catch {
    return true;
  }
}

function companyFacts(family) {
  return {
    companyName: closureConfirmName(family),
    orgnr: text(family?.company?.orgnr || family?.orgnr, 20),
  };
}

/** Varsel til eier og de andre administratorene, så en avslutning ikke går upåaktet hen. */
async function notifyAdmins(db, family, familyId, actorUid, { title, body }) {
  const uids = [...new Set([family.ownerUid, family.ownerId, ...(Array.isArray(family.adminUids) ? family.adminUids : [])]
    .map((uid) => text(uid, 128)).filter((uid) => uid && uid !== actorUid))];
  await Promise.all(uids.map((uid) => db.collection(`users/${uid}/notifications`).add({
    eventType: 'companyClosure',
    title,
    body,
    familyId,
    createdAt: FieldValue.serverTimestamp(),
    seen: false,
  }).catch(() => null)));
}

/**
 * Avslutt bedriften: frist for sletting om 90 dager. data: { confirm, accountingConfirmed, reason }.
 * Svar: { ok, closure, hasAccounting }
 */
export async function closeCompanyFor(db, {
  familyId, uid, actorName = '', data = {}, now = new Date(),
} = {}) {
  const { id, ref, family } = await loadAdminCompany(db, familyId, uid);
  const hasAccounting = await companyHasAccounting(db, id);
  const error = closureRequestError({
    family, uid, confirm: data.confirm, accountingConfirmed: data.accountingConfirmed === true, hasAccounting,
  });
  if (error) throw new ClosureError('failed-precondition', error);
  const logRef = db.doc(`${CLOSURE_COLLECTION}/${id}`);
  const logSnap = await logRef.get();
  const log = logSnap.exists ? (logSnap.data() || {}) : {};
  const record = closureRecord({
    uid, name: actorName, now, reason: data.reason, exportedBeforeClose: !!log.lastExportAt,
  });
  const event = {
    type: 'closed',
    at: record.closedAt,
    uid,
    deleteAfter: record.deleteAfter,
    hasAccounting,
    accountingConfirmed: data.accountingConfirmed === true,
    exportedBeforeClose: record.exportedBeforeClose,
  };
  const batch = db.batch();
  batch.set(logRef, {
    companyId: id,
    ...companyFacts(family),
    ...record,
    previousSubscriptionStatus: text(family.subscriptionStatus, 40) || null,
    events: FieldValue.arrayUnion(event),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(ref, {
    closure: record,
    closedAt: record.closedAt,
    deleteAfter: record.deleteAfter,
    subscriptionStatus: 'cancelled',
    subscriptionCancelReason: 'company_closed',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await notifyAdmins(db, family, id, uid, {
    title: `${closureConfirmName(family)} er avsluttet`,
    body: `${record.closedByName || 'En administrator'} avsluttet bedriften. Alle data slettes etter ${record.deleteAfter.slice(0, 10)}. Eier eller administrator kan angre under Selskapsinnstillinger → Personvern.`,
  });
  return { ok: true, closure: record, hasAccounting };
}

/** Angre avslutningen før fristen. */
export async function reopenCompanyFor(db, {
  familyId, uid, actorName = '', now = new Date(),
} = {}) {
  const { id, ref, family } = await loadAdminCompany(db, familyId, uid);
  const error = reopenError({ family, uid, now });
  if (error) throw new ClosureError('failed-precondition', error);
  const logRef = db.doc(`${CLOSURE_COLLECTION}/${id}`);
  const logSnap = await logRef.get();
  const log = logSnap.exists ? (logSnap.data() || {}) : {};
  const at = now.toISOString();
  const batch = db.batch();
  batch.set(logRef, {
    status: 'reopened',
    reopenedAt: at,
    reopenedByUid: uid,
    events: FieldValue.arrayUnion({ type: 'reopened', at, uid, name: text(actorName, 120) }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(ref, {
    closure: FieldValue.delete(),
    closedAt: FieldValue.delete(),
    deleteAfter: FieldValue.delete(),
    subscriptionStatus: log.previousSubscriptionStatus || FieldValue.delete(),
    subscriptionCancelReason: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true };
}

/** Alle dokumenter under ref (også under dokumenter som bare finnes som sti). */
async function walkDocuments(db, ref, rootPath, out) {
  const collections = await ref.listCollections();
  for (const col of collections) {
    if (ref.path === rootPath && EXPORT_SKIP.has(col.id)) continue;
    const refs = await col.listDocuments();
    for (let i = 0; i < refs.length; i += 300) {
      const snaps = await db.getAll(...refs.slice(i, i + 300));
      for (const snap of snaps) {
        if (!snap.exists) continue;
        out.push({ path: snap.ref.path.slice(rootPath.length + 1), data: toPlain(snap.data()) });
      }
      if (out.length > MAX_EXPORT_DOCS) {
        throw new ClosureError('resource-exhausted', 'Bedriften har for mye data til eksport i appen. Kontakt support@protop.no.');
      }
    }
    await mapLimit(refs, PARALLEL, (child) => walkDocuments(db, child, rootPath, out));
  }
}

async function listCompanyFiles(bucket, familyId) {
  if (!bucket) return [];
  const prefix = `families/${familyId}/`;
  const [files] = await bucket.getFiles({ prefix });
  return files.map((file) => ({
    path: file.name,
    size: Number(file.metadata?.size || 0),
    contentType: text(file.metadata?.contentType, 120),
    updated: text(file.metadata?.updated, 40),
  })).sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Eksport av hele bedriften: alle dokumenter (tilgangsnøkler og hemmelige felt fjernes) og
 * listen over filer. Filene selv hentes med downloadStorageFile. Svar: gzip som base64.
 */
export async function exportCompanyDataFor(db, bucket, {
  familyId, uid, now = new Date(),
} = {}) {
  const { id, ref, family } = await loadAdminCompany(db, familyId, uid);
  const rootPath = ref.path;
  const documents = [];
  await walkDocuments(db, ref, rootPath, documents);
  documents.sort((a, b) => (a.path < b.path ? -1 : 1));
  const files = await listCompanyFiles(bucket, id);
  const closure = companyClosure(family);
  const payload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    company: { id, ...companyFacts(family), document: toPlain(family) },
    closure,
    note: 'Alle bedriftens dokumenter i ProTop. Stiene er relative til bedriften. Filene ligger i mappen filer/ i ZIP-filen fra appen. '
      + 'Regnskapsmateriale (fakturaer og bilag) skal oppbevares i fem år etter regnskapsårets slutt (bokføringsloven § 13).',
    documents,
    files,
  };
  const gzip = gzipSync(Buffer.from(JSON.stringify(payload)));
  if (gzip.length > MAX_EXPORT_GZIP_BYTES) {
    throw new ClosureError('resource-exhausted', 'Eksporten er for stor til å lastes ned i appen. Kontakt support@protop.no.');
  }
  await db.doc(`${CLOSURE_COLLECTION}/${id}`).set({
    companyId: id,
    lastExportAt: now.toISOString(),
    events: FieldValue.arrayUnion({
      type: 'export', at: now.toISOString(), uid, documents: documents.length, files: files.length,
    }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    ok: true,
    fileName: companyExportName(family, now),
    gzipBase64: gzip.toString('base64'),
    documents: documents.length,
    files,
  };
}

async function deleteQuery(query) {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) return deleted;
    const batch = snap.docs[0].ref.firestore.batch();
    snap.docs.forEach((row) => batch.delete(row.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) return deleted;
  }
}

function idPrefixQuery(db, collection, prefix) {
  return db.collection(collection)
    .where(FieldPath.documentId(), '>=', prefix)
    .where(FieldPath.documentId(), '<', `${prefix}`);
}

function memberUidsOf(family) {
  const out = new Set();
  for (const key of ['ownerUid', 'ownerId', 'createdBy', 'adminUid']) if (family?.[key]) out.add(String(family[key]));
  for (const key of ['members', 'activeUsers', 'memberIds', 'adminUids']) {
    const list = family?.[key];
    if (Array.isArray(list)) list.forEach((uid) => uid && out.add(String(uid)));
    else if (list && typeof list === 'object') Object.keys(list).forEach((uid) => out.add(uid));
  }
  return out;
}

/** Brukerne som peker til bedriften: medlemmer og profiler med bedriften i familyIds/activeFamilyId. */
async function linkedUids(db, familyId, family) {
  const uids = memberUidsOf(family);
  const [members, byIds, byActive, parentsByIds] = await Promise.all([
    db.collection(`families/${familyId}/parents`).get(),
    db.collection('users').where('familyIds', 'array-contains', familyId).get(),
    db.collection('users').where('activeFamilyId', '==', familyId).get(),
    db.collection('parents').where('familyIds', 'array-contains', familyId).get(),
  ]);
  members.docs.forEach((row) => uids.add(String(row.data()?.uid || row.id)));
  [...byIds.docs, ...byActive.docs, ...parentsByIds.docs].forEach((row) => uids.add(row.id));
  return [...uids].filter((uid) => uid && !uid.includes('/'));
}

/** Fjern bedriften fra profilene og slett varslene som gjelder den. */
async function unlinkUser(db, uid, familyId) {
  const userRef = db.doc(`users/${uid}`);
  const parentRef = db.doc(`parents/${uid}`);
  const [user, parent] = await Promise.all([userRef.get(), parentRef.get()]);
  if (user.exists) {
    const data = user.data() || {};
    const patch = { familyIds: FieldValue.arrayRemove(familyId) };
    if (data.activeFamilyId === familyId) patch.activeFamilyId = FieldValue.delete();
    if (data.familyId === familyId) patch.familyId = FieldValue.delete();
    await userRef.update(patch);
  }
  if (parent.exists) {
    const data = parent.data() || {};
    const patch = { familyIds: FieldValue.arrayRemove(familyId) };
    if (data.familyId === familyId) patch.familyId = FieldValue.delete();
    await parentRef.update(patch);
  }
  return deleteQuery(db.collection(`users/${uid}/notifications`).where('familyId', '==', familyId));
}

/**
 * Sletter én bedrift: filer i Storage, dokumentet med alle underkolleksjoner og koblingene på
 * toppnivå. Tåler å kjøres på nytt hvis den stopper halvveis. Svar: { deleted, files, users, errors }
 */
export async function purgeCompany(db, buckets, familyId, { family = {}, actorUid = '', now = new Date() } = {}) {
  const errors = [];
  const step = async (label, run) => {
    try {
      return await run();
    } catch (error) {
      errors.push(`${label}: ${String(error?.message || error).slice(0, 200)}`);
      return 0;
    }
  };
  const uids = await step('brukere', () => linkedUids(db, familyId, family)) || [];
  let files = 0;
  for (const bucket of buckets || []) {
    files += await step(`filer i ${bucket.name || 'bucket'}`, async () => {
      const prefix = `families/${familyId}/`;
      const [list] = await bucket.getFiles({ prefix });
      if (list.length) await bucket.deleteFiles({ prefix, force: true });
      return list.length;
    });
  }
  await step('bedriftens dokumenter', () => db.recursiveDelete(db.doc(`families/${familyId}`)));
  await step('PowerOffice-kobling', () => db.doc(`powerOfficeClients/${familyId}`).delete());
  await step('orgnr-oppslag', () => deleteQuery(db.collection('orgnrIndex').where('familyId', '==', familyId)));
  await step('bli med-koder', () => deleteQuery(db.collection('joinCodes').where('familyId', '==', familyId)));
  await step('avtaledeling', () => deleteQuery(db.collection('agreementShares').where('companyId', '==', familyId)));
  await step('EHF-låser', () => deleteQuery(idPrefixQuery(db, 'ehfDeliveries', `${familyId}_`)));
  await step('AI-tellere', () => deleteQuery(idPrefixQuery(db, 'aiUsage', `family_${familyId}_`)));
  for (const uid of uids) await step(`bruker ${uid}`, () => unlinkUser(db, uid, familyId));

  const at = now.toISOString();
  const logRef = db.doc(`${CLOSURE_COLLECTION}/${familyId}`);
  if (errors.length) {
    // Står som avsluttet, så neste kjøring prøver igjen.
    await logRef.set({ lastPurgeAttemptAt: at, lastPurgeErrors: errors.slice(0, 20) }, { merge: true });
    return { deleted: false, files, users: uids.length, errors };
  }
  await logRef.set({
    status: 'deleted',
    deletedAt: at,
    deletedBy: actorUid || 'system',
    // Beviset beholdes uten navn: id, orgnr, frister og antall.
    companyName: FieldValue.delete(),
    closedByName: FieldValue.delete(),
    reason: FieldValue.delete(),
    lastPurgeErrors: FieldValue.delete(),
    counts: { files, users: uids.length },
    events: FieldValue.arrayUnion({ type: 'deleted', at, uid: actorUid || 'system', files, users: uids.length }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { deleted: true, files, users: uids.length, errors };
}

/**
 * Sletter bedrifter der fristen er ute. Tørrkjøring (dryRun, standard) viser bare hva som ville
 * blitt slettet. companyId begrenser til én bedrift. Svar: { dryRun, results: [{ companyId, purge, reason, … }] }
 */
export async function runCompanyPurge(db, buckets, {
  now = new Date(), companyId = '', dryRun = true, actorUid = '',
} = {}) {
  const id = text(companyId, 120);
  if (id.includes('/')) throw new ClosureError('invalid-argument', 'Ugyldig bedrift.');
  const snaps = id
    ? [await db.doc(`${CLOSURE_COLLECTION}/${id}`).get()]
    : (await db.collection(CLOSURE_COLLECTION).where('status', '==', 'closed').limit(100).get()).docs;
  const results = [];
  for (const snap of snaps) {
    if (!snap.exists) {
      results.push({ companyId: snap.id, purge: false, reason: 'not-closed' });
      continue;
    }
    const record = snap.data() || {};
    const famSnap = await db.doc(`families/${snap.id}`).get();
    const family = famSnap.exists ? (famSnap.data() || {}) : null;
    const decision = purgeDecision({ record, family, now });
    const row = { companyId: snap.id, deleteAfter: text(record.deleteAfter, 40), ...decision };
    if (decision.purge && !dryRun) {
      Object.assign(row, await purgeCompany(db, buckets, snap.id, { family: family || {}, actorUid, now }));
    }
    results.push(row);
  }
  return { dryRun: !!dryRun, results };
}

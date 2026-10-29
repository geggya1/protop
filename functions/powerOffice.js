/**
 * PowerOffice Go-integrasjon: kall fra appen.
 *
 * Lagring:
 * - powerOfficeClients/{familyId}: klientnøkkel, miljø, produktvalg, kundekoblinger og
 *   synkmarkør. Ingen Firestore-regel gir tilgang, så bare serveren leser og skriver.
 *   Appen får statusen uten nøkkelen gjennom powerOfficeStatus.
 * - families/{familyId}/invoices/{id}.poweroffice: salgsordre, fakturanummer, KID osv.
 *
 * Applikasjons- og abonnementsnøkkelen ligger i Secret Manager (se POWEROFFICE_ENVS).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { assertCompanyAccess, assertFamilyMember, assertRateLimit, hashRateKey } from './security.js';
import { resolveRuntimeSecret } from './runtimeSecret.js';
import {
  createPowerOfficeClient, findClientEnvironment, POWEROFFICE_ENVS, PowerOfficeError, powerOfficeErrorText,
} from './powerOfficeApi.js';
import { normalizeProductCodes } from './powerOfficeMap.js';
import {
  lookupOutgoingInvoice, productsWithVat, requestSend, sendFailedPatch, syncInvoices, transferInvoice,
} from './powerOfficeSync.js';

if (!getApps().length) initializeApp();

const CALL = {
  region: 'europe-west1',
  cors: true,
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '256MiB',
};

function statusRef(db, familyId) {
  return db.doc(`powerOfficeClients/${familyId}`);
}

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Du må være innlogget.');
  return uid;
}

function familyIdFrom(request) {
  const familyId = String(request.data?.familyId || '').trim();
  if (!familyId || familyId.includes('/')) throw new HttpsError('invalid-argument', 'Bedrift mangler.');
  return familyId;
}

// Samme rettigheter som appen viser (EconomySettingsScreen og EconomyInvoices):
// Admin på Økonomi → Innstillinger kobler til og velger produkter, og den som kan
// redigere Faktura (Begrenset redigering) overfører utkast. Eier og administratorer kan alt.
const SETTINGS_ACCESS = {
  resource: 'economySettings',
  action: 'write',
  message: 'Krever Admin på Økonomi – Innstillinger i tilgangsstyringen.',
};
const TRANSFER_ACCESS = {
  resource: 'economyInvoices',
  action: 'read',
  message: 'Krever redigeringstilgang til Faktura i tilgangsstyringen.',
};

function toHttpsError(err, where) {
  if (err instanceof HttpsError) return err;
  if (err instanceof PowerOfficeError) {
    logger.warn(`PowerOffice ${where}`, { status: err.status, path: err.path, message: err.message });
    if (err.status === 401 || err.status === 403) return new HttpsError('permission-denied', err.message);
    if (err.status === 429 || err.status === 503) return new HttpsError('resource-exhausted', err.message);
    if (err.status >= 500) return new HttpsError('unavailable', powerOfficeErrorText(err));
    return new HttpsError('failed-precondition', powerOfficeErrorText(err));
  }
  if (err?.message) {
    logger.warn(`PowerOffice ${where}`, { message: err.message });
    return new HttpsError('failed-precondition', err.message);
  }
  logger.error(`PowerOffice ${where}`, err);
  return new HttpsError('internal', 'Noe gikk galt mot PowerOffice.');
}

async function limitCalls(db, uid, name, limit) {
  try {
    await assertRateLimit(db, { key: hashRateKey(['poweroffice', name, uid]), limit, windowMs: 60 * 60 * 1000 });
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') throw err;
    logger.warn('PowerOffice rate limit skipped', { message: err?.message });
  }
}

async function envKeys(env) {
  const names = POWEROFFICE_ENVS[env].secrets;
  const [applicationKey, subscriptionKey] = await Promise.all([
    resolveRuntimeSecret(names.applicationKey),
    resolveRuntimeSecret(names.subscriptionKey),
  ]);
  return { applicationKey, subscriptionKey };
}

async function keysReady() {
  const out = {};
  for (const env of Object.keys(POWEROFFICE_ENVS)) {
    const keys = await envKeys(env);
    out[env] = !!(keys.applicationKey && keys.subscriptionKey);
  }
  return out;
}

async function clientFor(db, familyId, status = null) {
  const data = status || await readStatus(db, familyId);
  if (data.connected !== true || !data.clientKey) {
    throw new HttpsError('failed-precondition', 'PowerOffice er ikke koblet til for denne bedriften.');
  }
  const env = POWEROFFICE_ENVS[data.env] ? data.env : 'demo';
  return createPowerOfficeClient({ env, clientKey: data.clientKey, ...(await envKeys(env)) });
}

async function readStatus(db, familyId) {
  const snap = await statusRef(db, familyId).get();
  return snap.exists ? snap.data() || {} : {};
}

/** Offentlig del av statusen. Klientnøkkelen er aldri med. */
function publicStatus(status, ready) {
  return {
    connected: status.connected === true,
    env: status.env || '',
    clientName: status.clientName || '',
    invalidPrivileges: Array.isArray(status.invalidPrivileges) ? status.invalidPrivileges : [],
    productCodes: normalizeProductCodes(status.productCodes),
    autoSend: status.autoSend === true,
    lastSyncAt: status.lastSyncAt || '',
    lastSyncCounts: status.lastSyncCounts || null,
    keysReady: ready,
  };
}

export const powerOfficeStatus = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  return publicStatus(await readStatus(db, familyId), await keysReady());
});

/**
 * Kobler bedriften til en PowerOffice-klient (klientnøkkel fra Utvidelser i Go),
 * eller lagrer produktvalget per MVA-sats.
 */
export const powerOfficeConnect = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertCompanyAccess(db, familyId, uid, SETTINGS_ACCESS);
  await limitCalls(db, uid, 'connect', 30);
  const at = new Date().toISOString();
  const update = { updatedAt: at, updatedBy: uid };

  if (request.data?.productCodes) {
    update.productCodes = normalizeProductCodes(request.data.productCodes);
  }
  // Send fakturaen fra Go med en gang den er overført. Av som standard.
  if (typeof request.data?.autoSend === 'boolean') update.autoSend = request.data.autoSend;

  const clientKey = String(request.data?.clientKey || '').trim();
  if (clientKey) {
    if (!/^[0-9a-f-]{32,40}$/i.test(clientKey)) {
      throw new HttpsError('invalid-argument', 'Klientnøkkelen ser ikke riktig ut.');
    }
    // Miljøet (produksjon eller testklient) følger av nøkkelen. Brukeren velger det ikke.
    let env;
    let info;
    try {
      ({ env, info } = await findClientEnvironment(clientKey, { keysFor: envKeys }));
    } catch (err) {
      throw toHttpsError(err, 'connect');
    }
    Object.assign(update, {
      connected: true,
      env,
      clientKey,
      clientName: String(info?.ClientName || ''),
      clientId: String(info?.ClientId || ''),
      invalidPrivileges: Array.isArray(info?.InvalidPrivileges) ? info.InvalidPrivileges : [],
      connectedAt: at,
      connectedBy: uid,
    });
    const previous = await readStatus(db, familyId);
    // Ny klient: kundekoblinger og synkmarkør gjelder den gamle klienten.
    if (previous.clientId && previous.clientId !== update.clientId) {
      update.customers = FieldValue.delete();
      update.balanceCursor = '';
    }
  }

  await statusRef(db, familyId).set(update, { merge: true });
  return publicStatus(await readStatus(db, familyId), await keysReady());
});

export const powerOfficeDisconnect = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertCompanyAccess(db, familyId, uid, SETTINGS_ACCESS);
  const at = new Date().toISOString();
  await statusRef(db, familyId).set({
    connected: false,
    clientKey: FieldValue.delete(),
    disconnectedAt: at,
    updatedAt: at,
    updatedBy: uid,
  }, { merge: true });
  return publicStatus(await readStatus(db, familyId), await keysReady());
});

/** Produktene i Go, til valg av produkt per MVA-sats. */
export const powerOfficeProducts = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertCompanyAccess(db, familyId, uid, SETTINGS_ACCESS);
  try {
    const client = await clientFor(db, familyId);
    return { products: await productsWithVat(client) };
  } catch (err) {
    throw toHttpsError(err, 'products');
  }
});

async function loadProTopCustomer(db, familyId, invoice) {
  const customerId = String(invoice?.customerId || '');
  if (!customerId) return null;
  for (const path of [`families/${familyId}/anbud/customers`, `families/${familyId}/anbud/state`]) {
    const snap = await db.doc(path).get().catch(() => null);
    // anbud/state har kundene under state.customers, registeret har dem øverst.
    const data = snap?.exists ? snap.data() : null;
    const list = Array.isArray(data?.customers) ? data.customers : data?.state?.customers;
    const hit = Array.isArray(list) ? list.find((row) => row?.id === customerId) : null;
    if (hit) return hit;
  }
  return null;
}

/** Overfør ett fakturautkast til PowerOffice som salgsordre. */
export const powerOfficeTransferInvoice = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const invoiceId = String(request.data?.invoiceId || '').trim();
  if (!invoiceId || invoiceId.includes('/')) throw new HttpsError('invalid-argument', 'Faktura mangler.');
  const db = getFirestore();
  await assertCompanyAccess(db, familyId, uid, TRANSFER_ACCESS);
  await limitCalls(db, uid, 'transfer', 200);

  const invoiceRef = db.doc(`families/${familyId}/invoices/${invoiceId}`);
  const snap = await invoiceRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fant ikke fakturaen.');
  const invoice = { id: snap.id, ...snap.data() };
  const draft = invoice.status === 'draft' || /utkast|draft/i.test(String(invoice.exportStatus || ''));
  if (!draft || invoice.sentAt) {
    throw new HttpsError('failed-precondition', 'Bare utkast som ikke er sendt kan overføres.');
  }

  const status = await readStatus(db, familyId);
  const customer = await loadProTopCustomer(db, familyId, invoice);
  const knownCustomer = invoice.customerId ? status.customers?.[invoice.customerId] || null : null;
  try {
    const client = await clientFor(db, familyId, status);
    const result = await transferInvoice(client, {
      invoice,
      customer,
      knownCustomer,
      productCodes: status.productCodes || {},
      again: request.data?.again === true,
    });
    // send: «Send nå» på et overført utkast. autoSend: bedriften sender alt som overføres.
    const wantSend = request.data?.send === true || status.autoSend === true;
    let current = invoice;
    if (result.already) {
      if (!wantSend) return { already: true, poweroffice: invoice.poweroffice || null };
    } else {
      await invoiceRef.set(result.patch, { merge: true });
      if (invoice.customerId && result.customerLink) {
        await statusRef(db, familyId).set({ customers: { [invoice.customerId]: result.customerLink } }, { merge: true });
      }
      current = { ...invoice, ...result.patch };
    }
    if (!wantSend || current.poweroffice?.state !== 'draft') {
      return { already: !!result.already, poweroffice: current.poweroffice || null };
    }
    const at = new Date().toISOString();
    try {
      const sent = await requestSend(client, { invoice: current, at });
      await invoiceRef.set(sent, { merge: true });
      return { already: !!result.already, sent: true, poweroffice: sent.poweroffice };
    } catch (err) {
      // Utkastet ligger i Go. Feilen lagres, så den vises på fakturaen og kan rettes.
      const message = err instanceof PowerOfficeError ? powerOfficeErrorText(err) : (err?.message || 'Sendingen feilet.');
      if (err instanceof PowerOfficeError) logger.warn('PowerOffice send', { status: err.status, path: err.path, message: err.message });
      const failed = sendFailedPatch(current, message, { at });
      await invoiceRef.set(failed, { merge: true });
      return { already: !!result.already, sent: false, sendError: failed.poweroffice.sendError, poweroffice: failed.poweroffice };
    }
  } catch (err) {
    throw toHttpsError(err, 'transfer');
  }
});

/** Hent fakturanummer, KID, forsendelse og betalingsstatus fra PowerOffice. */
export const powerOfficeSyncInvoices = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  await limitCalls(db, uid, 'sync', 120);

  const status = await readStatus(db, familyId);
  if (status.connected !== true) return { counts: null, connected: false };
  const snap = await db.collection(`families/${familyId}/invoices`)
    .where('poweroffice.state', 'in', ['draft', 'sending', 'sent'])
    .get();
  const invoices = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
  const at = new Date().toISOString();
  try {
    const client = await clientFor(db, familyId, status);
    const result = await syncInvoices(client, { invoices, cursor: status.balanceCursor || '', at });
    for (let i = 0; i < result.patches.length; i += 400) {
      const batch = db.batch();
      for (const { id, patch } of result.patches.slice(i, i + 400)) {
        batch.set(db.doc(`families/${familyId}/invoices/${id}`), patch, { merge: true });
      }
      await batch.commit();
    }
    await statusRef(db, familyId).set({
      lastSyncAt: at,
      lastSyncCounts: result.counts,
      balanceCursor: result.cursor || status.balanceCursor || '',
    }, { merge: true });
    return { connected: true, counts: result.counts, updated: result.patches.map((row) => row.id) };
  } catch (err) {
    throw toHttpsError(err, 'sync');
  }
});

/** Les én faktura fra Go på fakturanummer, uten å lagre noe. Tester tilbakehentingen. */
export const powerOfficeLookupInvoice = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const familyId = familyIdFrom(request);
  const db = getFirestore();
  await assertFamilyAdmin(db, familyId, uid);
  await limitCalls(db, uid, 'lookup', 120);
  const status = await readStatus(db, familyId);
  try {
    const client = await clientFor(db, familyId, status);
    return await lookupOutgoingInvoice(client, { invoiceNo: request.data?.invoiceNo });
  } catch (err) {
    throw toHttpsError(err, 'lookup');
  }
});

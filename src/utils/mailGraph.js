/**
 * E-post direkte mot Microsoft Graph fra appen.
 *
 * Tokenet ligger på Outlook-tilkoblingen under users/{uid}/calendarConnections, som
 * bare eieren kan lese. Når det er i ferd med å gå ut, fornyer Cloud Function
 * listMailFolders det (ensureFreshToken), og vi leser det på nytt. Da slipper hvert
 * klikk en kald Cloud Function og to skrivinger til rate-limit-tabellen.
 */
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { listMailFolders as listMailFoldersCallable } from './outlookMail';
import {
  FOLDER_SELECT,
  MESSAGE_FULL_SELECT,
  MESSAGE_LIST_SELECT,
  SENSITIVITY_PROP_ID,
  WELL_KNOWN_FOLDERS,
  base64Size,
  collectGraphFolders,
  dataImagesToInline,
  graphListFilter,
  injectIntoBody,
  inlineCandidates,
  mapGraphAttachment,
  mapGraphMessage,
  mapGraphMessageFull,
  replaceCidImages,
  sensitivityProps,
  stripForeignStyles,
  extractBodyInner,
  toGraphRecipients,
  COMPOSE_MARK,
} from './mailModel';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 25000;
/** Tokenet regnes som brukbart til det har så lite igjen. */
const TOKEN_MARGIN_MS = 15 * 1000;
/** Serveren fornyer når det er under ett minutt igjen. */
const RENEW_BEFORE_MS = 45 * 1000;
const SIMPLE_ATTACH_MAX = 3 * 1024 * 1024;
const UPLOAD_CHUNK = 320 * 1024 * 10;
export const MAIL_FILE_MAX = 25 * 1024 * 1024;
export const MAIL_TOTAL_MAX = 30 * 1024 * 1024;

const tokens = new Map();
const refreshing = new Map();
const renewTimers = new Map();
const keepers = new Map();

export class MailGraphError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'MailGraphError';
    this.status = status;
    this.code = code;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enc(id) {
  return encodeURIComponent(String(id || ''));
}

async function readStoredToken(connectionId) {
  const uid = auth?.currentUser?.uid;
  if (!uid || !connectionId) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'calendarConnections', String(connectionId)));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  if (!data.accessToken) return null;
  return { token: String(data.accessToken), expiresAt: Number(data.expiresAt || 0) };
}

function usable(entry) {
  return !!entry?.token && entry.expiresAt > Date.now() + TOKEN_MARGIN_MS;
}

async function renewOnServer(connectionId) {
  await listMailFoldersCallable(connectionId).catch(() => null);
  return readStoredToken(connectionId).catch(() => null);
}

function scheduleRenew(connectionId, expiresAt) {
  clearTimeout(renewTimers.get(connectionId));
  if (!keepers.get(connectionId)) return;
  const delay = Math.max(5000, Number(expiresAt || 0) - Date.now() - RENEW_BEFORE_MS);
  renewTimers.set(connectionId, setTimeout(async () => {
    if (!keepers.get(connectionId)) return;
    const next = await renewOnServer(connectionId);
    if (usable(next)) {
      tokens.set(connectionId, next);
      scheduleRenew(connectionId, next.expiresAt);
    }
  }, delay));
}

/** Holder tokenet varmt mens e-post er åpen, så ingen klikk venter på fornyelse. */
export function keepMailTokenFresh(connectionId) {
  if (!connectionId) return () => {};
  keepers.set(connectionId, (keepers.get(connectionId) || 0) + 1);
  const mem = tokens.get(connectionId);
  if (mem) scheduleRenew(connectionId, mem.expiresAt);
  return () => {
    const n = (keepers.get(connectionId) || 1) - 1;
    if (n <= 0) {
      keepers.delete(connectionId);
      clearTimeout(renewTimers.get(connectionId));
      renewTimers.delete(connectionId);
    } else {
      keepers.set(connectionId, n);
    }
  };
}

export async function getMailToken(connectionId, { force = false } = {}) {
  const mem = tokens.get(connectionId);
  if (!force && usable(mem)) return mem.token;
  if (refreshing.has(connectionId)) return refreshing.get(connectionId);
  const job = (async () => {
    let stored = await readStoredToken(connectionId).catch((e) => {
      throw new MailGraphError('Fikk ikke lest Outlook-tilkoblingen.', { code: 'token', status: e?.code === 'permission-denied' ? 403 : 0 });
    });
    const sameAsBad = force && mem && stored?.token === mem.token;
    if (!usable(stored) || sameAsBad) stored = await renewOnServer(connectionId);
    if (!usable(stored)) {
      tokens.delete(connectionId);
      throw new MailGraphError('Outlook-tilgangen må fornyes. Gi e-posttilgang på nytt under Innstillinger.', { status: 401, code: 'token' });
    }
    tokens.set(connectionId, stored);
    scheduleRenew(connectionId, stored.expiresAt);
    return stored.token;
  })();
  refreshing.set(connectionId, job);
  try {
    return await job;
  } finally {
    refreshing.delete(connectionId);
  }
}

function friendlyGraphMessage(status, data) {
  const code = String(data?.error?.code || '');
  const msg = String(data?.error?.message || '');
  if (status === 403 || /AccessDenied/i.test(code)) {
    return 'Outlook mangler tilgang til dette. Gi e-posttilgang på nytt under Innstillinger.';
  }
  if (status === 404 || /ItemNotFound|ErrorItemNotFound/i.test(code)) return 'Fant ikke meldingen. Den kan være flyttet eller slettet.';
  if (status === 429) return 'Outlook ber oss vente litt. Prøv igjen om et øyeblikk.';
  if (/ErrorMessageSizeExceeded|too large/i.test(`${code} ${msg}`)) return 'Meldingen er for stor for Outlook.';
  return msg || `Outlook svarte ${status}`;
}

/**
 * Ett kall mot Graph. Prøver på nytt ved 401 (nytt token), og ved 429/503 for
 * kall som trygt kan gjentas. Sending gjentas aldri, så ingen får e-posten to ganger.
 */
export async function graphFetch(connectionId, path, {
  method = 'GET',
  body,
  headers,
  raw = false,
  timeoutMs = TIMEOUT_MS,
  retry = method === 'GET' || method === 'PATCH' ? 2 : 0,
} = {}) {
  const url = /^https?:/i.test(path) ? path : `${GRAPH}${path}`;
  let attempt = 0;
  let forced = false;
  for (;;) {
    const token = await getMailToken(connectionId, { force: forced });
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(headers || {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (attempt < retry) {
        attempt += 1;
        await wait(400 * attempt);
        continue;
      }
      throw new MailGraphError(
        e?.name === 'AbortError' ? 'Outlook svarte ikke i tide. Prøv igjen.' : 'Fikk ikke kontakt med Outlook. Sjekk nettet.',
        { code: 'network' },
      );
    }
    if (timer) clearTimeout(timer);
    if (res.status === 401 && !forced) {
      forced = true;
      continue;
    }
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < retry) {
      attempt += 1;
      const after = Number(res.headers?.get?.('Retry-After')) || attempt;
      await wait(Math.min(6, after) * 1000);
      continue;
    }
    if (raw && res.ok) return res;
    if (res.status === 202 || res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new MailGraphError(friendlyGraphMessage(res.status, data), {
        status: res.status,
        code: data?.error?.code || '',
      });
    }
    return data;
  }
}

/** Opptil 20 Graph-kall i én rundtur. Svar per id: { status, body }. */
export async function graphBatch(connectionId, requests) {
  const out = {};
  const list = requests || [];
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20);
    const run = () => graphFetch(connectionId, '/$batch', {
      method: 'POST',
      retry: 1,
      body: {
        requests: chunk.map((r) => ({
          id: r.id,
          method: r.method || 'GET',
          url: r.url,
          ...(r.body !== undefined ? { body: r.body } : {}),
          ...(r.body !== undefined || r.headers
            ? { headers: { ...(r.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(r.headers || {}) } }
            : {}),
        })),
      },
    });
    let data = await run();
    if ((data.responses || []).some((r) => r.status === 401)) {
      await getMailToken(connectionId, { force: true });
      data = await run();
    }
    (data.responses || []).forEach((r) => { out[r.id] = r; });
  }
  return out;
}

function batchOk(res) {
  return res && res.status >= 200 && res.status < 300;
}

function batchError(res, fallback) {
  const status = Number(res?.status || 0);
  return new MailGraphError(friendlyGraphMessage(status, res?.body) || fallback, {
    status,
    code: res?.body?.error?.code || '',
  });
}

/* ───────── Mapper ───────── */

const FOLDER_EXPAND = `childFolders($select=${FOLDER_SELECT};$top=100)`;

function topFoldersUrl() {
  return `/me/mailFolders?$top=100&$select=${FOLDER_SELECT}&$expand=${encodeURIComponent(FOLDER_EXPAND)}`;
}

function childFoldersUrl(id) {
  return `/me/mailFolders/${enc(id)}/childFolders?$top=100&$select=${FOLDER_SELECT}&$expand=${encodeURIComponent(FOLDER_EXPAND)}`;
}

function wellKnownRequests() {
  return WELL_KNOWN_FOLDERS
    .filter((w) => w !== 'outbox')
    .map((w) => ({ id: `wk-${w}`, url: `/me/mailFolders/${w}?$select=id` }));
}

function idToWellFrom(responses) {
  const map = new Map();
  WELL_KNOWN_FOLDERS.forEach((w) => {
    const res = responses[`wk-${w}`];
    if (batchOk(res) && res.body?.id) map.set(res.body.id, w);
  });
  return map;
}

/** Henter undermapper som ikke kom med i første svar, nivå for nivå. */
export async function loadDeeperFolders(connectionId, pending, idToWell = new Map()) {
  let queue = [...(pending || [])];
  const out = [];
  let guard = 0;
  while (queue.length && guard < 6) {
    guard += 1;
    const res = await graphBatch(connectionId, queue.map((f, i) => ({ id: `c${i}`, url: childFoldersUrl(f.id) })));
    const next = [];
    queue.forEach((parent, i) => {
      const r = res[`c${i}`];
      if (!batchOk(r)) return;
      const { folders, pending: more } = collectGraphFolders(r.body?.value || [], idToWell, Number(parent.depth || 0) + 1);
      out.push(...folders);
      next.push(...more);
    });
    queue = next;
  }
  return out;
}

/* ───────── Meldinger ───────── */

function messagesUrl(folderId, { top = 30, skip = 0, filter = 'all', since = '' } = {}) {
  const f = graphListFilter(filter, since);
  const parts = [
    `$top=${Math.max(5, Math.min(100, Number(top) || 30))}`,
    skip ? `$skip=${Math.max(0, Number(skip) || 0)}` : '',
    `$orderby=${encodeURIComponent('receivedDateTime desc')}`,
    `$select=${MESSAGE_LIST_SELECT}`,
    f ? `$filter=${encodeURIComponent(f)}` : '',
  ].filter(Boolean);
  return `/me/mailFolders/${enc(folderId || 'inbox')}/messages?${parts.join('&')}`;
}

function pageFrom(body, { top, skip }) {
  const rows = body?.value || [];
  return {
    messages: rows.map(mapGraphMessage),
    nextSkip: Number(skip || 0) + rows.length,
    hasMore: !!body?.['@odata.nextLink'] || rows.length >= Number(top || 30),
  };
}

/**
 * Første visning: mapper, kjente mapper og første side med meldinger i én rundtur.
 * `deeper` henter dypere undermapper etterpå, så listen ikke venter på dem.
 */
export async function loadMailbox(connectionId, { folderId = 'inbox', filter = 'all', top = 30 } = {}) {
  const res = await graphBatch(connectionId, [
    { id: 'f', url: topFoldersUrl() },
    ...wellKnownRequests(),
    { id: 'm', url: messagesUrl(folderId, { top, filter }) },
  ]);
  if (!batchOk(res.f)) throw batchError(res.f, 'Klarte ikke hente mapper');
  const idToWell = idToWellFrom(res);
  const { folders, pending } = collectGraphFolders(res.f.body?.value || [], idToWell, 0);
  let page = null;
  let resolvedFolder = folderId;
  if (batchOk(res.m)) {
    page = pageFrom(res.m.body, { top, skip: 0 });
  } else if (folderId !== 'inbox') {
    resolvedFolder = folders.find((f) => f.wellKnownName === 'inbox')?.id || 'inbox';
    page = await loadMailMessages(connectionId, resolvedFolder, { filter, top });
  } else {
    throw batchError(res.m, 'Klarte ikke hente e-post');
  }
  return {
    folders,
    folderId: resolvedFolder,
    page,
    deeper: () => (pending.length ? loadDeeperFolders(connectionId, pending, idToWell) : Promise.resolve([])),
  };
}

export async function loadMailFolders(connectionId) {
  const res = await graphBatch(connectionId, [{ id: 'f', url: topFoldersUrl() }, ...wellKnownRequests()]);
  if (!batchOk(res.f)) throw batchError(res.f, 'Klarte ikke hente mapper');
  const idToWell = idToWellFrom(res);
  const { folders, pending } = collectGraphFolders(res.f.body?.value || [], idToWell, 0);
  const deeper = pending.length ? await loadDeeperFolders(connectionId, pending, idToWell) : [];
  return [...folders, ...deeper];
}

export async function loadMailMessages(connectionId, folderId, { filter = 'all', top = 30, skip = 0, since = '' } = {}) {
  const body = await graphFetch(connectionId, messagesUrl(folderId, { top, skip, filter, since }));
  const page = pageFrom(body, { top, skip });
  if (since) page.hasMore = false;
  return page;
}

/** Søk i alle mapper (eller én), som søkefeltet i Outlook. */
export async function searchMailMessages(connectionId, query, { folderId = '', top = 40 } = {}) {
  const q = String(query || '').replace(/["\\]/g, ' ').trim();
  if (!q) return { messages: [] };
  const base = folderId ? `/me/mailFolders/${enc(folderId)}/messages` : '/me/messages';
  const body = await graphFetch(
    connectionId,
    `${base}?$search=${encodeURIComponent(`"${q}"`)}&$top=${top}&$select=${MESSAGE_LIST_SELECT}`,
  );
  const messages = (body?.value || []).map(mapGraphMessage)
    .sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')));
  return { messages };
}

const BODY_HEADERS = { Prefer: 'outlook.body-content-type="html"' };
const SENSITIVITY_EXPAND = `singleValueExtendedProperties($filter=id eq '${SENSITIVITY_PROP_ID}')`;

function messageRequests(id, prefix = '') {
  return [
    {
      id: `${prefix}m`,
      url: `/me/messages/${enc(id)}?$select=${MESSAGE_FULL_SELECT}&$expand=${encodeURIComponent(SENSITIVITY_EXPAND)}`,
      headers: BODY_HEADERS,
    },
    { id: `${prefix}a`, url: `/me/messages/${enc(id)}/attachments?$select=id,name,contentType,size,isInline` },
  ];
}

function fullFrom(res, prefix = '') {
  const m = res[`${prefix}m`];
  if (!batchOk(m)) return null;
  const a = res[`${prefix}a`];
  return mapGraphMessageFull(m.body, batchOk(a) ? (a.body?.value || []) : []);
}

/** Melding med tekst og vedlegg (uten innebygde bilder) i én rundtur. */
export async function loadMailMessage(connectionId, id) {
  const res = await graphBatch(connectionId, messageRequests(id));
  const message = fullFrom(res);
  if (!message) throw batchError(res.m, 'Klarte ikke åpne meldingen');
  return message;
}

/** Henter flere meldinger på forhånd (de øverste i listen). */
export async function prefetchMailMessages(connectionId, ids) {
  const list = (ids || []).slice(0, 10);
  if (!list.length) return [];
  const res = await graphBatch(connectionId, list.flatMap((id, i) => messageRequests(id, `p${i}`)));
  return list.map((id, i) => fullFrom(res, `p${i}`)).filter(Boolean);
}

/** Bytter cid:-bilder i teksten med de innebygde vedleggene. */
export async function loadInlineImages(connectionId, message) {
  const candidates = inlineCandidates(message).slice(0, 40);
  if (!candidates.length) return { html: message.html, known: {}, used: new Set() };
  const res = await graphBatch(connectionId, candidates.map((a, i) => ({
    id: `i${i}`,
    url: `/me/messages/${enc(message.id)}/attachments/${enc(a.id)}`,
  })));
  const images = candidates.map((a, i) => {
    const r = res[`i${i}`];
    if (!batchOk(r)) return null;
    return {
      id: a.id,
      contentId: r.body?.contentId || '',
      contentType: r.body?.contentType || a.contentType,
      contentBytes: r.body?.contentBytes || '',
    };
  }).filter(Boolean);
  return replaceCidImages(message.html, images);
}

/** Vedlegget som Blob (web). */
export async function downloadMailAttachment(connectionId, messageId, attachmentId) {
  const res = await graphFetch(
    connectionId,
    `/me/messages/${enc(messageId)}/attachments/${enc(attachmentId)}/$value`,
    { raw: true, timeoutMs: 120000 },
  );
  return res.blob();
}

/* ───────── Handlinger ───────── */

export async function updateMailMessages(connectionId, ids, patch) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) {
    await graphFetch(connectionId, `/me/messages/${enc(list[0])}`, { method: 'PATCH', body: patch });
    return;
  }
  const res = await graphBatch(connectionId, list.map((id, i) => ({
    id: `u${i}`, method: 'PATCH', url: `/me/messages/${enc(id)}`, body: patch,
  })));
  const failed = Object.values(res).find((r) => !batchOk(r));
  if (failed) throw batchError(failed, 'Klarte ikke oppdatere meldingene');
}

/** Flytter og returnerer meldingen med ny id (id endres ved flytting). */
export async function moveMailMessages(connectionId, ids, destinationId) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];
  const res = await graphBatch(connectionId, list.map((id, i) => ({
    id: `v${i}`, method: 'POST', url: `/me/messages/${enc(id)}/move`, body: { destinationId },
  })));
  return list.map((id, i) => {
    const r = res[`v${i}`];
    if (!batchOk(r)) throw batchError(r, 'Klarte ikke flytte meldingen');
    return { oldId: id, message: mapGraphMessage(r.body || {}) };
  });
}

export async function deleteMailMessagesPermanently(connectionId, ids) {
  const list = (ids || []).filter(Boolean);
  const res = await graphBatch(connectionId, list.map((id, i) => ({
    id: `d${i}`, method: 'DELETE', url: `/me/messages/${enc(id)}`,
  })));
  const failed = Object.values(res).find((r) => !batchOk(r) && r.status !== 404);
  if (failed) throw batchError(failed, 'Klarte ikke slette');
}

/** Kategoriene i postboksen. Krever MailboxSettings.Read; uten det brukes standardlisten. */
export async function loadMasterCategories(connectionId) {
  try {
    const body = await graphFetch(connectionId, '/me/outlook/masterCategories', { retry: 0 });
    return (body?.value || []).map((c) => ({ name: c.displayName, color: c.color }));
  } catch {
    return null;
  }
}

/* ───────── Skriv, utkast og send ───────── */

function bytesFromBase64(b64) {
  const clean = String(b64 || '').replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i += 1) lookup[chars.charCodeAt(i)] = i;
  const len = Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    if (p < len) out[p++] = (a << 2) | (b >> 4);
    if (p < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}

function graphAttachment(item) {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: String(item.name || 'vedlegg').slice(0, 200),
    contentType: item.contentType || 'application/octet-stream',
    contentBytes: item.contentBytes,
    isInline: !!item.isInline,
    ...(item.contentId ? { contentId: item.contentId } : {}),
  };
}

function itemSize(item) {
  return Number(item.size) || base64Size(item.contentBytes);
}

async function uploadLarge(connectionId, draftId, item) {
  const size = itemSize(item);
  const session = await graphFetch(connectionId, `/me/messages/${enc(draftId)}/attachments/createUploadSession`, {
    method: 'POST',
    retry: 1,
    body: {
      AttachmentItem: {
        attachmentType: 'file',
        name: item.name,
        size,
        contentType: item.contentType || 'application/octet-stream',
        isInline: !!item.isInline,
        ...(item.contentId ? { contentId: item.contentId } : {}),
      },
    },
  });
  const bytes = bytesFromBase64(item.contentBytes);
  for (let start = 0; start < bytes.length; start += UPLOAD_CHUNK) {
    const end = Math.min(bytes.length, start + UPLOAD_CHUNK);
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end - 1}/${bytes.length}`,
      },
      body: bytes.slice(start, end),
    });
    if (!res.ok && res.status !== 201 && res.status !== 200 && res.status !== 202) {
      throw new MailGraphError(`Klarte ikke laste opp ${item.name}.`, { status: res.status, code: 'upload' });
    }
  }
}

/** Laster opp vedlegg som ikke ligger på utkastet ennå. Returnerer Graph-id per nøkkel. */
async function uploadAttachments(connectionId, draftId, items) {
  const ids = {};
  for (const item of items) {
    if (itemSize(item) > SIMPLE_ATTACH_MAX) {
      await uploadLarge(connectionId, draftId, item);
    } else {
      const res = await graphFetch(connectionId, `/me/messages/${enc(draftId)}/attachments`, {
        method: 'POST',
        retry: 1,
        body: graphAttachment(item),
      });
      if (item.key && res?.id) ids[item.key] = res.id;
    }
  }
  return ids;
}

function messageFields(c, bodyHtml) {
  return {
    subject: String(c.subject || ''),
    body: { contentType: 'HTML', content: bodyHtml },
    toRecipients: toGraphRecipients(c.to),
    ccRecipients: toGraphRecipients(c.cc),
    bccRecipients: toGraphRecipients(c.bcc),
    importance: ['low', 'high'].includes(c.importance) ? c.importance : 'normal',
    isReadReceiptRequested: !!c.readReceipt,
    isDeliveryReceiptRequested: !!c.deliveryReceipt,
    singleValueExtendedProperties: sensitivityProps(c.sensitivity),
  };
}

const CREATE_ACTION = { reply: 'createReply', replyAll: 'createReplyAll', forward: 'createForward' };

/**
 * Lager eller oppdaterer utkastet i Kladd. Svar og videresending lages med
 * createReply/createForward, så sitat, tråd og (ved videresending) vedlegg blir som i Outlook.
 */
async function writeDraft(connectionId, c, html) {
  let draftId = c.draftId || '';
  let quoteHtml = c.quoteHtml || '';
  if (!draftId && CREATE_ACTION[c.mode] && c.sourceId) {
    const draft = await graphFetch(connectionId, `/me/messages/${enc(c.sourceId)}/${CREATE_ACTION[c.mode]}`, {
      method: 'POST',
      retry: 0,
      body: {},
      headers: BODY_HEADERS,
    });
    draftId = draft?.id || '';
    quoteHtml = String(draft?.body?.content || '');
    if (!draftId) throw new MailGraphError('Klarte ikke lage svarutkast.');
  }
  const body = quoteHtml ? injectIntoBody(quoteHtml, html) : `<div id="${COMPOSE_MARK}">${html}</div>`;
  if (!draftId) {
    const created = await graphFetch(connectionId, '/me/messages', {
      method: 'POST',
      retry: 0,
      body: messageFields(c, body),
    });
    draftId = created?.id || '';
    if (!draftId) throw new MailGraphError('Klarte ikke lagre utkastet.');
  } else {
    await graphFetch(connectionId, `/me/messages/${enc(draftId)}`, {
      method: 'PATCH',
      body: messageFields(c, body),
    });
  }
  return { draftId, quoteHtml };
}

function pendingUploads(c, inline) {
  const done = new Set(c.inlineUploaded || []);
  const inlineNew = inline.filter((a) => !done.has(a.contentId)).map((a) => ({ ...a, key: `cid:${a.contentId}` }));
  const filesNew = (c.files || []).filter((f) => !f.graphId).map((f) => ({ ...f, isInline: false }));
  return [...inlineNew, ...filesNew];
}

function assertSizes(items) {
  let total = 0;
  items.forEach((item) => {
    const size = itemSize(item);
    if (size > MAIL_FILE_MAX) throw new MailGraphError(`${item.name} er større enn 25 MB.`, { code: 'size' });
    total += size;
  });
  if (total > MAIL_TOTAL_MAX) throw new MailGraphError('Vedleggene er til sammen større enn 30 MB.', { code: 'size' });
}

/**
 * Lagrer utkastet. Returnerer det skjemaet trenger for å lagre igjen uten doble vedlegg.
 */
export async function saveMailDraft(connectionId, c) {
  const { html, attachments: inline } = dataImagesToInline(c.html, { known: c.inlineKnown || {} });
  const { draftId, quoteHtml } = await writeDraft(connectionId, c, html);
  const uploads = pendingUploads(c, inline);
  assertSizes(uploads);
  const ids = await uploadAttachments(connectionId, draftId, uploads);
  return {
    draftId,
    quoteHtml,
    inlineUploaded: [...new Set([...(c.inlineUploaded || []), ...inline.map((a) => a.contentId)])],
    files: (c.files || []).map((f) => (f.graphId ? f : { ...f, graphId: ids[f.key] || 'uploaded' })),
  };
}

/** Sender. Ny e-post uten store vedlegg går i ett kall; resten via utkast. */
export async function sendMailMessage(connectionId, c) {
  const { html, attachments: inline } = dataImagesToInline(c.html, { known: c.inlineKnown || {} });
  const uploads = pendingUploads(c, inline);
  assertSizes(uploads);
  const small = uploads.reduce((n, item) => n + itemSize(item), 0) < SIMPLE_ATTACH_MAX;
  if (c.mode === 'new' && !c.draftId && small) {
    await graphFetch(connectionId, '/me/sendMail', {
      method: 'POST',
      retry: 0,
      timeoutMs: 60000,
      body: {
        message: {
          ...messageFields(c, html),
          attachments: uploads.map(graphAttachment),
        },
        saveToSentItems: true,
      },
    });
    return;
  }
  const { draftId, quoteHtml } = await writeDraft(connectionId, c, html);
  try {
    await uploadAttachments(connectionId, draftId, uploads);
    await graphFetch(connectionId, `/me/messages/${enc(draftId)}/send`, {
      method: 'POST',
      retry: 0,
      timeoutMs: 60000,
    });
  } catch (e) {
    // Utkastet finnes nå i Kladd; et nytt forsøk skal bruke det, ikke lage et til.
    e.draftId = draftId;
    e.quoteHtml = quoteHtml;
    throw e;
  }
}

export async function removeDraftAttachment(connectionId, draftId, attachmentId) {
  if (!draftId || !attachmentId || attachmentId === 'uploaded') return;
  await graphFetch(connectionId, `/me/messages/${enc(draftId)}/attachments/${enc(attachmentId)}`, {
    method: 'DELETE',
  }).catch(() => {});
}

export async function discardMailDraft(connectionId, draftId) {
  if (!draftId) return;
  await graphFetch(connectionId, `/me/messages/${enc(draftId)}`, { method: 'DELETE' }).catch(() => {});
}

/**
 * Åpner et utkast fra Kladd i skjemaet. Er det laget her, deles det i vår
 * tekst og sitatet; ellers kan hele teksten redigeres.
 */
export async function openMailDraft(connectionId, id) {
  const message = await loadMailMessage(connectionId, id);
  const images = await loadInlineImages(connectionId, message).catch(() => ({ html: message.html, known: {}, used: new Set() }));
  let editable = '';
  let quoteHtml = '';
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(images.html, 'text/html');
    const mark = parsed.getElementById(COMPOSE_MARK);
    if (mark) {
      editable = mark.innerHTML;
      mark.remove();
      quoteHtml = `<html>${parsed.documentElement.innerHTML}</html>`;
      // Sitatet lagres med cid: igjen, ellers dobles bildene.
      Object.entries(images.known || {}).forEach(([dataUrl, cid]) => {
        quoteHtml = quoteHtml.split(dataUrl).join(`cid:${cid}`);
      });
    }
  }
  if (!editable) editable = stripForeignStyles(extractBodyInner(images.html));
  return {
    message,
    editable,
    quoteHtml,
    inlineKnown: images.known || {},
    inlineUploaded: Object.values(images.known || {}),
    files: message.attachments
      .filter((a) => !images.used?.has(a.id) && !a.isInline)
      .map((a) => ({ key: a.id, name: a.name, contentType: a.contentType, size: a.size, graphId: a.id })),
  };
}

export { mapGraphAttachment };

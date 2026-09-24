import * as logger from 'firebase-functions/logger';
import { microsoftGrantedMailAccess } from './msOauth.js';
import { loadMicrosoftConnection, requireAuth } from './calendarIntegration.js';
import { recipientsToList, sanitizeHtml, senderOf } from './sanitizeHtml.js';
import {
  FOLDER_CHILD_EXPAND,
  FOLDER_SELECT,
  applyWellKnownIds,
  collectExpandedFolders,
  mapMailFolder,
  missingPrimaryWellKnown,
} from './outlookMailFolders.js';
import {
  buildSendPayload,
  importanceOf,
  mapInlineAttachments,
  parseAddresses,
} from './outlookMailCompose.js';

export { buildSendPayload, mapInlineAttachments, parseAddresses };

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_PAGE = 25;
const MAX_PAGE = 40;

const LIST_SELECT = [
  'id', 'subject', 'from', 'toRecipients', 'receivedDateTime',
  'isRead', 'hasAttachments', 'bodyPreview', 'importance', 'flag', 'conversationId',
].join(',');

export async function graphJson(accessToken, url, { method = 'GET', body, headers } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 202 || res.status === 204
    ? {}
    : await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Graph ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

function mailConsentError() {
  const err = new Error(
    'Outlook har ikke e-posttilgang ennå. Trykk «Gi e-posttilgang» og godkjenn Mail.Read i Microsoft.',
  );
  err.needsMailConsent = true;
  return err;
}

async function readyMailConn(db, auth, connectionId) {
  const uid = requireAuth(auth);
  const conn = await loadMicrosoftConnection(db, uid, connectionId);
  if (!microsoftGrantedMailAccess(conn.grantedScope)) {
    throw mailConsentError();
  }
  return conn;
}

function mapFolder(raw, depth = 0, idToWell = new Map()) {
  return mapMailFolder(raw, depth, idToWell);
}

async function loadChildFolders(accessToken, parentId, depth, idToWell) {
  if (depth > 4) return [];
  const data = await graphJson(
    accessToken,
    `${GRAPH}/me/mailFolders/${encodeURIComponent(parentId)}/childFolders?$top=50&$select=${FOLDER_SELECT}`,
  );
  const mapped = (data.value || []).map((raw) => mapFolder(raw, depth, idToWell));
  const nested = await Promise.all(
    mapped
      .filter((folder) => folder.childFolderCount > 0)
      .map((folder) => loadChildFolders(accessToken, folder.id, depth + 1, idToWell)),
  );
  return [...mapped, ...nested.flat()];
}

async function fillMissingWellKnown(accessToken, folders) {
  const missing = missingPrimaryWellKnown(folders);
  if (!missing.length) return folders;
  const pairs = await Promise.all(missing.map(async (name) => {
    try {
      const raw = await graphJson(accessToken, `${GRAPH}/me/mailFolders/${name}?$select=id`);
      return raw?.id ? [raw.id, name] : null;
    } catch {
      return null;
    }
  }));
  const idToWell = new Map(pairs.filter(Boolean));
  return applyWellKnownIds(folders, idToWell);
}

export async function listFoldersFast(accessToken) {
  let top;
  try {
    top = await graphJson(
      accessToken,
      `${GRAPH}/me/mailFolders?$top=80&$select=${FOLDER_SELECT}&$expand=${FOLDER_CHILD_EXPAND}`,
    );
  } catch {
    top = await graphJson(
      accessToken,
      `${GRAPH}/me/mailFolders?$top=80&$select=${FOLDER_SELECT}`,
    );
  }
  const { folders, pending } = collectExpandedFolders(top.value || [], new Map(), 0);
  if (pending.length) {
    const extra = await Promise.all(
      pending.map((parent) => loadChildFolders(
        accessToken,
        parent.id,
        Number(parent.depth || 0) + 1,
        new Map(),
      )),
    );
    folders.push(...extra.flat());
  }
  return fillMissingWellKnown(accessToken, folders);
}

function mapMessageSummary(raw) {
  const from = senderOf(raw);
  return {
    id: raw.id,
    subject: raw.subject || '(uten emne)',
    from,
    to: recipientsToList(raw.toRecipients),
    receivedAt: raw.receivedDateTime || null,
    isRead: raw.isRead === true,
    hasAttachments: raw.hasAttachments === true,
    preview: String(raw.bodyPreview || '').replace(/\s+/g, ' ').trim(),
    importance: raw.importance || 'normal',
    flagged: String(raw.flag?.flagStatus || '').toLowerCase() === 'flagged',
    conversationId: raw.conversationId || null,
  };
}

function pageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE;
  return Math.min(MAX_PAGE, Math.max(10, Math.round(n)));
}

function graphSinceIso(since) {
  const raw = String(since || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  d.setSeconds(d.getSeconds() - 60);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function mailListFilter({ unreadOnly, since } = {}) {
  const parts = [];
  if (unreadOnly) parts.push('isRead eq false');
  const iso = graphSinceIso(since);
  if (iso) parts.push(`receivedDateTime ge ${iso}`);
  return parts.length ? `&$filter=${parts.join(' and ')}` : '';
}

export async function listMessagesFast(
  accessToken,
  folderId,
  unreadOnly,
  skip = 0,
  top = DEFAULT_PAGE,
  since = '',
) {
  const size = pageSize(top);
  const iso = graphSinceIso(since);
  const offset = iso ? 0 : Math.max(0, Number(skip || 0) || 0);
  const filter = mailListFilter({ unreadOnly, since });
  const path = !folderId || folderId === 'inbox'
    ? `${GRAPH}/me/mailFolders/inbox/messages`
    : `${GRAPH}/me/mailFolders/${encodeURIComponent(folderId)}/messages`;
  const url = `${path}?$top=${size}&$skip=${offset}&$orderby=receivedDateTime desc&$select=${LIST_SELECT}${filter}`;
  const res = await graphJson(accessToken, url);
  const rows = res.value || [];
  return {
    messages: rows.map(mapMessageSummary),
    nextSkip: offset + rows.length,
    hasMore: iso ? false : rows.length >= size,
    incremental: !!iso,
  };
}

async function listMessagesSafe(accessToken, folderId, unreadOnly, skip, top, since) {
  try {
    return await listMessagesFast(accessToken, folderId, unreadOnly, skip, top, since);
  } catch (error) {
    let current = error;
    if (since) {
      try {
        return await listMessagesFast(accessToken, folderId, unreadOnly, skip, top, '');
      } catch (inner) {
        current = inner;
      }
    }
    const msg = String(current?.message || '');
    if (folderId && folderId !== 'inbox' && /targeted mailbox|does not belong|doesn't belong/i.test(msg)) {
      const page = await listMessagesFast(accessToken, 'inbox', unreadOnly, skip, top, since);
      return { ...page, folderId: 'inbox' };
    }
    throw current;
  }
}

export async function handleListMailFolders(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const folders = await listFoldersFast(conn.accessToken);
  return {
    ok: true,
    connectionId: conn.id,
    email: conn.email || null,
    folders,
  };
}

export async function handleListMailMessages(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const folderId = String(data?.folderId || 'inbox');
  const unreadOnly = data?.unreadOnly === true;
  const skip = Math.max(0, Number(data?.skip || 0) || 0);
  const page = await listMessagesSafe(
    conn.accessToken,
    folderId,
    unreadOnly,
    skip,
    data?.top,
    data?.since,
  );
  return {
    ok: true,
    connectionId: conn.id,
    folderId: page.folderId || folderId,
    messages: page.messages,
    nextSkip: page.nextSkip,
    hasMore: page.hasMore,
  };
}

export async function handleSyncMailbox(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const requestedFolder = String(data?.folderId || '').trim() || 'inbox';
  const unreadOnly = data?.unreadOnly === true;
  const foldersPromise = listFoldersFast(conn.accessToken);
  const messagesPromise = listMessagesSafe(
    conn.accessToken,
    requestedFolder,
    unreadOnly,
    0,
    data?.top,
  );
  const [folders, page] = await Promise.all([foldersPromise, messagesPromise]);
  return {
    ok: true,
    connectionId: conn.id,
    email: conn.email || null,
    folders,
    folderId: page.folderId || requestedFolder,
    messages: page.messages,
    nextSkip: page.nextSkip,
    hasMore: page.hasMore,
  };
}

export async function handleGetMailMessage(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const id = String(data?.messageId || '');
  if (!id) return { ok: false, error: 'Mangler meldings-id' };
  const raw = await graphJson(
    conn.accessToken,
    `${GRAPH}/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,body,bodyPreview,conversationId,importance,flag`,
  );
  if (raw.isRead === false) {
    graphJson(conn.accessToken, `${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { isRead: true },
    }).catch(() => {});
  }
  const html = raw.body?.contentType === 'html'
    ? sanitizeHtml(raw.body.content)
    : `<pre>${sanitizeHtml(String(raw.body?.content || raw.bodyPreview || ''))}</pre>`;
  return {
    ok: true,
    message: {
      ...mapMessageSummary(raw),
      cc: recipientsToList(raw.ccRecipients),
      html,
      isRead: true,
    },
  };
}

async function addDraftAttachments(accessToken, draftId, attachments) {
  const items = mapInlineAttachments(attachments);
  if (!items.length || !draftId) return;
  await Promise.all(items.map((item) => graphJson(
    accessToken,
    `${GRAPH}/me/messages/${encodeURIComponent(draftId)}/attachments`,
    { method: 'POST', body: item },
  )));
}

function mergeDraftHtml(userHtml, draft) {
  const user = sanitizeHtml(String(userHtml || ''));
  const existing = String(draft?.body?.content || '');
  const type = String(draft?.body?.contentType || '').toLowerCase();
  if (!existing) return user || '<div><br></div>';
  if (type === 'html') return `${user || '<div><br></div>'}<br>${existing}`;
  return `${user || '<div><br></div>'}<pre>${sanitizeHtml(existing)}</pre>`;
}

async function sendViaDraft(accessToken, {
  messageId, mode, body, to, bcc, importance, readReceipt, attachments,
}) {
  const action = mode === 'forward'
    ? 'createForward'
    : mode === 'replyAll'
      ? 'createReplyAll'
      : 'createReply';
  const payload = mode === 'forward' && parseAddresses(to).length
    ? { toRecipients: parseAddresses(to) }
    : {};
  const draft = await graphJson(
    accessToken,
    `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/${action}`,
    {
      method: 'POST',
      body: payload,
      headers: { Prefer: 'return=representation' },
    },
  );
  const draftId = draft?.id;
  if (!draftId) {
    throw new Error('Klarte ikke opprette svarutkast');
  }
  const patch = {
    body: {
      contentType: 'HTML',
      content: mergeDraftHtml(body, draft),
    },
    importance: importanceOf(importance),
  };
  if (readReceipt) patch.isReadReceiptRequested = true;
  const bccList = parseAddresses(bcc);
  if (bccList.length) patch.bccRecipients = bccList;
  await graphJson(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    body: patch,
  });
  await addDraftAttachments(accessToken, draftId, attachments);
  await graphJson(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(draftId)}/send`, {
    method: 'POST',
    body: {},
  });
}

async function sendCommentFallback(accessToken, { messageId, mode, body, to }) {
  if (mode === 'forward') {
    await graphJson(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/forward`, {
      method: 'POST',
      body: { comment: String(body || ''), toRecipients: parseAddresses(to) },
    });
    return;
  }
  await graphJson(
    accessToken,
    `${GRAPH}/me/messages/${encodeURIComponent(messageId)}/${mode === 'replyAll' ? 'replyAll' : 'reply'}`,
    { method: 'POST', body: { comment: String(body || '') } },
  );
}

export async function handleSendMail(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const built = buildSendPayload(data);
  if (!built.to.length) return { ok: false, error: 'Mangler mottaker' };
  await graphJson(conn.accessToken, `${GRAPH}/me/sendMail`, {
    method: 'POST',
    body: {
      message: built.message,
      saveToSentItems: true,
    },
  });
  return { ok: true };
}

export async function handleReplyMail(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const id = String(data?.messageId || '');
  if (!id) return { ok: false, error: 'Mangler meldings-id' };
  const mode = data?.replyAll === true ? 'replyAll' : 'reply';
  try {
    await sendViaDraft(conn.accessToken, {
      messageId: id,
      mode,
      body: data?.body,
      bcc: data?.bcc,
      importance: data?.importance,
      readReceipt: data?.readReceipt,
      attachments: data?.attachments,
    });
  } catch (error) {
    logger.warn('html reply draft failed, falling back', { message: error?.message });
    await sendCommentFallback(conn.accessToken, {
      messageId: id,
      mode,
      body: data?.body,
    });
  }
  return { ok: true };
}

export async function handleForwardMail(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const id = String(data?.messageId || '');
  const to = parseAddresses(data?.to);
  if (!id) return { ok: false, error: 'Mangler meldings-id' };
  if (!to.length) return { ok: false, error: 'Mangler mottaker' };
  try {
    await sendViaDraft(conn.accessToken, {
      messageId: id,
      mode: 'forward',
      body: data?.body,
      to: data?.to,
      bcc: data?.bcc,
      importance: data?.importance,
      readReceipt: data?.readReceipt,
      attachments: data?.attachments,
    });
  } catch (error) {
    logger.warn('html forward draft failed, falling back', { message: error?.message });
    await sendCommentFallback(conn.accessToken, {
      messageId: id,
      mode: 'forward',
      body: data?.body,
      to: data?.to,
    });
  }
  return { ok: true };
}

export async function handleDeleteMail(data, auth, db) {
  const conn = await readyMailConn(db, auth, data?.connectionId);
  const id = String(data?.messageId || '');
  if (!id) return { ok: false, error: 'Mangler meldings-id' };
  const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${conn.accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error?.message || 'Klarte ikke slette meldingen');
  }
  return { ok: true };
}

export function wrapMailHandler(fn, fallback) {
  return async (data, auth, db) => {
    try {
      return await fn(data, auth, db);
    } catch (error) {
      logger.warn('outlook mail failed', { message: error?.message, code: error?.code });
      return {
        ok: false,
        needsMailConsent: error?.needsMailConsent === true || error?.status === 403,
        error: error?.message || fallback,
      };
    }
  };
}

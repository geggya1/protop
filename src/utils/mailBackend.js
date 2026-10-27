/**
 * E-post går direkte mot Microsoft Graph (mailGraph). Kan ikke appen lese
 * Outlook-tokenet, brukes de gamle Cloud Functions for det grunnleggende:
 * lese, sende, svare, videresende og slette.
 */
import * as graph from './mailGraph';
import {
  syncOutlookMailbox,
  listMailMessages,
  getMailMessage,
  sendOutlookMail,
  replyOutlookMail,
  forwardOutlookMail,
  deleteOutlookMail,
} from './outlookMail';
import { formatRecipient } from './mailModel';

const directOff = new Set();

export function isDirectMail(connectionId) {
  return !directOff.has(connectionId);
}

function canFallback(e) {
  return e?.name === 'MailGraphError' && e.code === 'token' && e.status === 403;
}

function callableError(res, fallback) {
  const err = new Error(res?.error || fallback);
  err.needsMailConsent = res?.needsMailConsent === true;
  err.code = res?.code || '';
  return err;
}

async function direct(connectionId, run, fallback) {
  if (isDirectMail(connectionId)) {
    try {
      return await run();
    } catch (e) {
      if (!canFallback(e) || !fallback) throw e;
      directOff.add(connectionId);
    }
  }
  if (!fallback) throw new Error('Dette krever at e-posten kobles til på nytt under Innstillinger.');
  return fallback();
}

export function bootMailbox(connectionId, { folderId = 'inbox', filter = 'all', top = 30 } = {}) {
  return direct(
    connectionId,
    () => graph.loadMailbox(connectionId, { folderId, filter, top }),
    async () => {
      const res = await syncOutlookMailbox(connectionId, { folderId, unreadOnly: filter === 'unread', top });
      if (!res?.ok) throw callableError(res, 'Klarte ikke hente e-post');
      return {
        folders: res.folders || [],
        folderId: res.folderId || folderId,
        page: { messages: res.messages || [], hasMore: !!res.hasMore, nextSkip: res.nextSkip || 0 },
        deeper: () => Promise.resolve([]),
      };
    },
  );
}

export function listMessages(connectionId, folderId, { filter = 'all', top = 30, skip = 0, since = '' } = {}) {
  return direct(
    connectionId,
    () => graph.loadMailMessages(connectionId, folderId, { filter, top, skip, since }),
    async () => {
      const res = await listMailMessages(connectionId, {
        folderId, unreadOnly: filter === 'unread', skip, top, since: since || undefined,
      });
      if (!res?.ok) throw callableError(res, 'Klarte ikke hente e-post');
      return { messages: res.messages || [], hasMore: !!res.hasMore, nextSkip: res.nextSkip || 0 };
    },
  );
}

export function loadFolders(connectionId) {
  return direct(connectionId, () => graph.loadMailFolders(connectionId));
}

export function getMessage(connectionId, id) {
  return direct(
    connectionId,
    () => graph.loadMailMessage(connectionId, id),
    async () => {
      const res = await getMailMessage(connectionId, id);
      if (!res?.ok) throw callableError(res, 'Klarte ikke åpne meldingen');
      return { ...res.message, attachments: [], categories: [], full: true };
    },
  );
}

function legacyList(list) {
  return (list || []).map(formatRecipient).filter(Boolean).join('; ');
}

export function sendCompose(connectionId, c) {
  return direct(
    connectionId,
    () => graph.sendMailMessage(connectionId, c),
    async () => {
      if ((c.files || []).length) throw new Error('Vedlegg krever at e-posten kobles til på nytt under Innstillinger.');
      const payload = {
        to: legacyList(c.to),
        cc: legacyList(c.cc),
        bcc: legacyList(c.bcc),
        subject: c.subject,
        body: c.html,
        html: true,
        importance: c.importance || 'normal',
        readReceipt: !!c.readReceipt,
      };
      let res;
      if ((c.mode === 'reply' || c.mode === 'replyAll') && c.sourceId) {
        res = await replyOutlookMail(connectionId, c.sourceId, { ...payload, replyAll: c.mode === 'replyAll' });
      } else if (c.mode === 'forward' && c.sourceId) {
        res = await forwardOutlookMail(connectionId, c.sourceId, payload);
      } else {
        res = await sendOutlookMail(connectionId, payload);
      }
      if (!res?.ok) throw callableError(res, 'Sending feilet');
    },
  );
}

export function deleteMessages(connectionId, ids) {
  return direct(
    connectionId,
    () => graph.moveMailMessages(connectionId, ids, 'deleteditems'),
    async () => {
      for (const id of ids || []) {
        const res = await deleteOutlookMail(connectionId, id);
        if (!res?.ok) throw callableError(res, 'Klarte ikke slette');
      }
      return (ids || []).map((id) => ({ oldId: id, message: null }));
    },
  );
}

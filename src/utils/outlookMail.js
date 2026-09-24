import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { assertClientCallableBudget, dedupeInflight } from './costGuards';

async function call(name, data) {
  const budget = assertClientCallableBudget(name);
  if (!budget.allowed) {
    return {
      ok: false,
      error: budget.reason || 'For mange forespørsler. Prøv igjen senere.',
      rateLimited: true,
    };
  }
  const payload = data || {};
  const key = `${name}:${JSON.stringify(payload)}`;
  return dedupeInflight(key, async () => {
    try {
      const fn = httpsCallable(functions, name, { timeout: 60000 });
      const res = await fn(payload);
      return res.data;
    } catch (err) {
      return {
        ok: false,
        error: err?.message || String(err),
        code: err?.code || null,
      };
    }
  });
}

export async function listMailFolders(connectionId) {
  return call('listMailFolders', { connectionId });
}

export async function listMailMessages(connectionId, { folderId, unreadOnly, skip, top, since } = {}) {
  return call('listMailMessages', { connectionId, folderId, unreadOnly, skip, top, since });
}

export async function syncOutlookMailbox(connectionId, { folderId, unreadOnly, top } = {}) {
  return call('syncOutlookMailbox', { connectionId, folderId, unreadOnly, top });
}

export async function getMailMessage(connectionId, messageId) {
  return call('getMailMessage', { connectionId, messageId });
}

export async function sendOutlookMail(connectionId, payload) {
  return call('sendOutlookMail', { connectionId, ...payload, html: true });
}

export async function replyOutlookMail(connectionId, messageId, payload) {
  return call('replyOutlookMail', { connectionId, messageId, ...payload });
}

export async function forwardOutlookMail(connectionId, messageId, payload) {
  return call('forwardOutlookMail', { connectionId, messageId, ...payload });
}

export async function deleteOutlookMail(connectionId, messageId) {
  return call('deleteOutlookMail', { connectionId, messageId });
}

export function formatMailWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest = d.getFullYear() === yest.getFullYear()
    && d.getMonth() === yest.getMonth()
    && d.getDate() === yest.getDate();
  if (isYest) return `i går ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
  if (now.getTime() - d.getTime() < 6 * 86400000) {
    return `${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function mailSectionLabel(iso) {
  if (!iso) return 'Eldre';
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (t === startToday) return 'I dag';
  if (t === startToday - 86400000) return 'I går';
  return 'Eldre';
}

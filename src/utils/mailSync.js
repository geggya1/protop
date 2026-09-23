/** Skip network for this long — opening Mail twice in a sitting should be cache. */
export const MAIL_FRESH_MS = 12 * 60 * 1000;
/** Unread badges on folders can refresh a bit more often than the message list. */
export const MAIL_FOLDER_FRESH_MS = 5 * 60 * 1000;
/** Keep folders/messages on disk so neste åpning viser innboks med en gang. */
export const MAIL_STORAGE_MS = 12 * 60 * 60 * 1000;
export const MAIL_LIST_PAGE = 25;

export function isMailCacheFresh(hit, freshMs = MAIL_FRESH_MS) {
  if (!hit) return false;
  const at = Number(hit.at || 0);
  if (!at) return false;
  return Date.now() - at <= freshMs;
}

export function mergeMailMessages(prev, incoming, { append = false, merge = false } = {}) {
  const next = Array.isArray(incoming) ? incoming : [];
  const list = Array.isArray(prev) ? prev : [];
  if (merge) {
    const byId = new Map();
    list.forEach((m) => { if (m?.id) byId.set(m.id, m); });
    next.forEach((m) => { if (m?.id) byId.set(m.id, m); });
    return [...byId.values()].sort((a, b) => (
      String(b.receivedAt || b.receivedDateTime || '').localeCompare(
        String(a.receivedAt || a.receivedDateTime || ''),
      )
    ));
  }
  if (!append) return next;
  if (!list.length) return next;
  const seen = new Set(list.map((m) => m.id));
  const extra = next.filter((m) => m?.id && !seen.has(m.id));
  return extra.length ? [...list, ...extra] : list;
}

export function newestMailReceivedAt(messages) {
  let max = 0;
  for (const m of messages || []) {
    const t = Date.parse(m?.receivedAt || m?.receivedDateTime || '');
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max ? new Date(max).toISOString() : '';
}

/**
 * @returns {'none' | 'folders' | 'incremental' | 'full'}
 */
export function mailRefreshPlan({
  foldersFresh, messagesFresh, hasMessages, force,
} = {}) {
  if (force) return 'full';
  if (foldersFresh && messagesFresh) return 'none';
  if (hasMessages && !messagesFresh) return 'incremental';
  if (!foldersFresh && messagesFresh) return 'folders';
  return 'full';
}

export function pickInboxFolderId(folders, fallback = 'inbox') {
  const list = folders || [];
  const inbox = list.find((f) => (
    f.wellKnownName === 'inbox' || /^innboks$|^inbox$/i.test(f.name || '')
  ));
  return inbox?.id || list[0]?.id || fallback;
}

export function shouldUseMailboxSync({ foldersFresh, messagesFresh, force }) {
  if (force) return false;
  return !foldersFresh && !messagesFresh;
}

const MAIL_FALLBACK = 'Kunne ikke hente e-post akkurat nå. Prøv igjen.';

function mailErrorText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return String(value.message || value.code || value.error || '');
  }
  return String(value);
}

export function isMailCallableUnavailable(err) {
  const raw = mailErrorText(err).toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    code.includes('not-found') ||
    code.includes('not_found') ||
    code.includes('functions/internal') ||
    code === 'internal' ||
    raw.includes('functions/not-found') ||
    raw.includes('functions/internal') ||
    raw.includes('not-found') ||
    raw.includes('not_found') ||
    raw === 'internal' ||
    raw.includes('cors') ||
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('unavailable')
  );
}

export function friendlyMailError(err, fallback = MAIL_FALLBACK) {
  const raw = mailErrorText(err).trim();
  if (!raw) return fallback;
  if (/rate.?limit|for mange kall/i.test(raw)) return raw;
  if (isMailCallableUnavailable(err) || isMailCallableUnavailable(raw)) return fallback;
  if (/^(internal|not-found|not_found|unavailable|permission-denied)$/i.test(raw)) {
    return fallback;
  }
  if (/functions\//i.test(raw) || /access-control-allow-origin/i.test(raw)) {
    return fallback;
  }
  return raw;
}

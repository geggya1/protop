import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAIL_FRESH_MS, MAIL_STORAGE_MS } from './mailSync';

const MEMORY = new Map();
const BODY_MEMORY = new Map();
const STORAGE_PREFIX = 'weekplan.mailCache.v1';
const DEFAULT_TTL_MS = MAIL_FRESH_MS;
const STORAGE_TTL_MS = MAIL_STORAGE_MS;
const BODY_TTL_MS = MAIL_STORAGE_MS;
const BODY_MAX = 40;
const BODY_MAX_CHARS = 180000;

function rangeKey(uid, connectionId, folderId, unreadOnly) {
  return `${uid || 'anon'}|${connectionId || ''}|${folderId || ''}|${unreadOnly ? '1' : '0'}`;
}

function storageKey(uid, connectionId, folderId, unreadOnly) {
  return `${STORAGE_PREFIX}.${rangeKey(uid, connectionId, folderId, unreadOnly)}`;
}

function foldersKey(uid, connectionId) {
  return `${STORAGE_PREFIX}.folders.${uid || 'anon'}|${connectionId || ''}`;
}

function inboxUnreadKey(uid) {
  return `${STORAGE_PREFIX}.inboxUnread.${uid || 'anon'}`;
}

const inboxUnreadListeners = new Set();

function notifyInboxUnread(uid, count) {
  inboxUnreadListeners.forEach((fn) => {
    try { fn(uid, count); } catch { /* ignore */ }
  });
}

function inboxUnreadFromFolders(folders) {
  const list = folders || [];
  const inbox = list.find((f) => (
    f.wellKnownName === 'inbox' || /^innboks$|^inbox$/i.test(f.name || '')
  ));
  return Number(inbox?.unread || 0);
}

/** Synk-les siste kjente innboks-ulest (for rød app-badge). */
export function peekMailInboxUnread(uid) {
  const hit = MEMORY.get(inboxUnreadKey(uid));
  if (!hit) return 0;
  return Number(hit.count || 0);
}

export function putMailInboxUnread(uid, count) {
  const n = Math.max(0, Number(count) || 0);
  const entry = { at: Date.now(), count: n };
  MEMORY.set(inboxUnreadKey(uid), entry);
  AsyncStorage.setItem(inboxUnreadKey(uid), JSON.stringify(entry)).catch(() => {});
  notifyInboxUnread(uid, n);
  return entry;
}

export async function loadMailInboxUnread(uid) {
  const key = inboxUnreadKey(uid);
  const mem = MEMORY.get(key);
  if (mem) return Number(mem.count || 0);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    MEMORY.set(key, parsed);
    return Number(parsed?.count || 0);
  } catch {
    return 0;
  }
}

export function subscribeMailInboxUnread(listener) {
  if (typeof listener !== 'function') return () => {};
  inboxUnreadListeners.add(listener);
  return () => inboxUnreadListeners.delete(listener);
}

export function peekMailFoldersCache(uid, connectionId, { maxAgeMs = DEFAULT_TTL_MS } = {}) {
  const key = foldersKey(uid, connectionId);
  const hit = MEMORY.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return { ...hit, stale: true };
  return { ...hit, stale: false };
}

export function peekMailMessagesCache(uid, connectionId, folderId, unreadOnly, {
  maxAgeMs = DEFAULT_TTL_MS,
} = {}) {
  const key = rangeKey(uid, connectionId, folderId, unreadOnly);
  const hit = MEMORY.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return { ...hit, stale: true };
  return { ...hit, stale: false };
}

export function putMailMessagesCache(uid, connectionId, folderId, unreadOnly, messages) {
  const key = rangeKey(uid, connectionId, folderId, unreadOnly);
  const entry = { at: Date.now(), messages: messages || [] };
  MEMORY.set(key, entry);
  AsyncStorage.setItem(
    storageKey(uid, connectionId, folderId, unreadOnly),
    JSON.stringify(entry),
  ).catch(() => {});
  return entry;
}

export async function loadMailMessagesCache(uid, connectionId, folderId, unreadOnly) {
  const mem = peekMailMessagesCache(uid, connectionId, folderId, unreadOnly, {
    maxAgeMs: STORAGE_TTL_MS,
  });
  if (mem && !mem.stale) return mem;
  try {
    const raw = await AsyncStorage.getItem(
      storageKey(uid, connectionId, folderId, unreadOnly),
    );
    if (!raw) return mem || null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.messages)) return mem || null;
    const age = Date.now() - Number(parsed.at || 0);
    if (age > STORAGE_TTL_MS) return mem || null;
    MEMORY.set(rangeKey(uid, connectionId, folderId, unreadOnly), parsed);
    return { ...parsed, stale: age > DEFAULT_TTL_MS };
  } catch {
    return mem || null;
  }
}

export function putMailFoldersCache(uid, connectionId, folders) {
  const key = foldersKey(uid, connectionId);
  const entry = { at: Date.now(), folders: folders || [] };
  MEMORY.set(key, entry);
  AsyncStorage.setItem(key, JSON.stringify(entry)).catch(() => {});
  putMailInboxUnread(uid, inboxUnreadFromFolders(folders));
  return entry;
}

export async function loadMailFoldersCache(uid, connectionId) {
  const key = foldersKey(uid, connectionId);
  const mem = MEMORY.get(key);
  if (mem && Date.now() - mem.at <= STORAGE_TTL_MS) {
    return { ...mem, stale: Date.now() - mem.at > DEFAULT_TTL_MS };
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return mem ? { ...mem, stale: true } : null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.folders)) return null;
    const age = Date.now() - Number(parsed.at || 0);
    if (age > STORAGE_TTL_MS) return null;
    MEMORY.set(key, parsed);
    return { ...parsed, stale: age > DEFAULT_TTL_MS };
  } catch {
    return null;
  }
}

function bodyKey(uid, connectionId, messageId) {
  return `${STORAGE_PREFIX}.body.${uid || 'anon'}|${connectionId || ''}|${messageId || ''}`;
}

function trimBodyMemory() {
  while (BODY_MEMORY.size > BODY_MAX) {
    const first = BODY_MEMORY.keys().next().value;
    BODY_MEMORY.delete(first);
  }
}

export function peekMailMessageCache(uid, connectionId, messageId, {
  maxAgeMs = BODY_TTL_MS,
} = {}) {
  const key = bodyKey(uid, connectionId, messageId);
  const hit = BODY_MEMORY.get(key);
  if (!hit?.message) return null;
  if (Date.now() - hit.at > maxAgeMs) return { ...hit, stale: true };
  return { ...hit, stale: false };
}

export function putMailMessageCache(uid, connectionId, messageId, message) {
  if (!messageId || !message) return null;
  const html = String(message.html || '');
  const stored = html.length > BODY_MAX_CHARS
    ? { ...message, html: '', preview: message.preview || html.slice(0, 240) }
    : message;
  const entry = { at: Date.now(), message: stored };
  const key = bodyKey(uid, connectionId, messageId);
  BODY_MEMORY.delete(key);
  BODY_MEMORY.set(key, entry);
  trimBodyMemory();
  if (html.length && html.length <= BODY_MAX_CHARS) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, JSON.stringify(entry));
      }
    } catch { /* quota */ }
    AsyncStorage.setItem(key, JSON.stringify(entry)).catch(() => {});
  }
  return entry;
}

export async function loadMailMessageCache(uid, connectionId, messageId) {
  const mem = peekMailMessageCache(uid, connectionId, messageId, { maxAgeMs: BODY_TTL_MS });
  if (mem && !mem.stale) return mem;
  const key = bodyKey(uid, connectionId, messageId);
  try {
    let raw = null;
    if (typeof sessionStorage !== 'undefined') {
      raw = sessionStorage.getItem(key);
    }
    if (!raw) raw = await AsyncStorage.getItem(key);
    if (!raw) return mem || null;
    const parsed = JSON.parse(raw);
    if (!parsed?.message) return mem || null;
    const age = Date.now() - Number(parsed.at || 0);
    if (age > BODY_TTL_MS) return mem || null;
    BODY_MEMORY.set(key, parsed);
    return { ...parsed, stale: age > DEFAULT_TTL_MS };
  } catch {
    return mem || null;
  }
}

export function clearMailCache(uid) {
  const prefix = `${uid || 'anon'}|`;
  const folderPrefix = `${STORAGE_PREFIX}.folders.${uid || 'anon'}|`;
  const bodyPrefix = `${STORAGE_PREFIX}.body.${uid || 'anon'}|`;
  const unreadKey = inboxUnreadKey(uid);
  for (const key of MEMORY.keys()) {
    if (
      key.startsWith(prefix)
      || key.startsWith(folderPrefix)
      || key === unreadKey
      || key.includes(`|${uid}|`)
    ) {
      MEMORY.delete(key);
    }
  }
  for (const key of [...BODY_MEMORY.keys()]) {
    if (key.startsWith(bodyPrefix)) BODY_MEMORY.delete(key);
  }
  putMailInboxUnread(uid, 0);
}

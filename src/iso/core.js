/**
 * ISO / K-HMS — felles byggeklosser.
 * Ren JavaScript uten React/Firebase, slik at domenereglene kan testes med node --test.
 */

export function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

export function nowIso(now = new Date()) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

export function todayKey(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function addDays(dateKey, days) {
  const day = isoDate(dateKey);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function prettyDate(value) {
  const day = isoDate(value);
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y}`;
}

let counter = 0;
export function newId(prefix = 'iso') {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Stabil JSON (sorterte nøkler) — brukes til sjekksum i revisjonsspor. */
export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit. Ikke kryptografisk, men oppdager endringer i revisjonsspor og bevis. */
export function checksum(value) {
  const input = typeof value === 'string' ? value : stableJson(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function actorOf(actor) {
  return {
    uid: text(actor?.uid, 128),
    name: text(actor?.name, 160) || 'Ukjent bruker',
  };
}

/**
 * Revisjonsspor. Hendelsen inneholder sjekksum av før/etter, aldri hele objektet,
 * så sensitive felt ikke kopieres inn i loggen.
 */
export function auditEvent({ entityType, entityId, action, actor, before = null, after = null, reason = '', now = new Date() }) {
  const who = actorOf(actor);
  return {
    id: newId('evt'),
    entityType: text(entityType, 60),
    entityId: text(entityId, 120),
    action: text(action, 80),
    actorUid: who.uid,
    actorName: who.name,
    at: nowIso(now),
    beforeHash: before ? checksum(before) : '',
    afterHash: after ? checksum(after) : '',
    reason: text(reason, 1000),
  };
}

/** Historikk på selve objektet (kort, lesbar). */
export function pushHistory(entity, action, actor, note = '', now = new Date()) {
  const who = actorOf(actor);
  const history = Array.isArray(entity?.history) ? entity.history : [];
  return [
    ...history,
    { at: nowIso(now), action: text(action, 80), by: who.name, uid: who.uid, note: text(note, 1000) },
  ].slice(-200);
}

export function bump(entity, actor, now = new Date()) {
  const who = actorOf(actor);
  return {
    ...entity,
    rev: (Number(entity?.rev) || 0) + 1,
    updatedAt: nowIso(now),
    updatedBy: who.name,
    updatedByUid: who.uid,
  };
}

export function ok(value, extra = {}) {
  return { ok: true, ...value, ...extra };
}

export function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

/** Løpenummer per type og år: AVV-2026-007. */
export function nextNumber(prefix, existing, now = new Date()) {
  const year = (now instanceof Date ? now : new Date(now)).getFullYear();
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const row of existing || []) {
    const value = String(row?.number || '');
    if (!value.startsWith(head)) continue;
    const n = Number(value.slice(head.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${head}${String(max + 1).padStart(3, '0')}`;
}

export function byId(list) {
  const map = new Map();
  for (const row of list || []) if (row?.id) map.set(row.id, row);
  return map;
}

export function upsert(list, entity) {
  const rows = Array.isArray(list) ? list : [];
  const idx = rows.findIndex((row) => row?.id === entity.id);
  if (idx < 0) return [...rows, entity];
  const next = rows.slice();
  next[idx] = entity;
  return next;
}

/**
 * Deler en liste i Firestore-batcher: høyst maxCount skrivinger og omtrent maxBytes per batch
 * (grensen er 500 skrivinger og 10 MiB). sizeOf gir omtrentlig størrelse per element.
 */
export function chunkForBatch(items, sizeOf = () => 1, { maxCount = 400, maxBytes = 5_000_000 } = {}) {
  const out = [];
  let cur = [];
  let bytes = 0;
  for (const item of items || []) {
    const n = Number(sizeOf(item)) || 0;
    if (cur.length && (cur.length >= maxCount || bytes + n > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(item);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function uniq(values) {
  return [...new Set((values || []).map((v) => text(v, 200)).filter(Boolean))];
}

export function monthKey(value) {
  const day = isoDate(value);
  return day ? day.slice(0, 7) : '';
}

export function lastMonths(count, now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export function monthLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return '';
  return `${MONTHS[Number(match[2]) - 1]} ${match[1].slice(2)}`;
}

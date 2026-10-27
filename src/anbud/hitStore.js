/**
 * Treffene i anbudsvarslingen, lagret for seg.
 * Hoveddokumentet deler plassen med kunder, kontrakter og tilbud. Når det blir fullt,
 * slippes ubehandlede treff først, og da måtte treffene hentes på nytt ved hvert besøk.
 * Her ligger bare listen, i en lett form, så den får plass i sitt eget dokument.
 */
import { mergeNotices, noticeDeadlineExpired } from './model.js';

/** Firestore sitt dokumenttak, med plass til tidsstempel. */
export const HIT_STORAGE_BYTES = 800_000;

const DESCRIPTION_LIMITS = [1500, 600, 200];

function text(value) {
  return String(value || '').trim();
}

function clip(value, max) {
  return text(value).slice(0, max);
}

function list(value, max, size = 200) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clip(item, size))
    .filter(Boolean)
    .slice(0, max);
}

function bytes(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
    return json.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function laterIso(left, right) {
  const a = Date.parse(left || '') || 0;
  const b = Date.parse(right || '') || 0;
  if (b > a) return right || null;
  return left || right || null;
}

/** Det listen, kartet og vurderingen trenger. Grunnlag, vedlegg og notater ligger i hoveddokumentet. */
export function hitRow(notice, descriptionLimit = DESCRIPTION_LIMITS[0]) {
  const row = notice && typeof notice === 'object' ? notice : {};
  const amount = Number(row.amount);
  const score = Number(row.aiFit?.score);
  const lat = Number(row.geo?.lat);
  const lng = Number(row.geo?.lng);
  return {
    id: clip(row.id, 120),
    title: clip(row.title, 300),
    buyer: clip(row.buyer, 200),
    description: clip(row.description, descriptionLimit),
    places: list(row.places, 8),
    locationIds: list(row.locationIds, 8, 20),
    amount: Number.isFinite(amount) && row.amount !== null && row.amount !== '' ? amount : null,
    currency: clip(row.currency, 8),
    winner: clip(row.winner, 200),
    profileIds: list(row.profileIds, 8, 80),
    kind: clip(row.kind, 20),
    status: clip(row.status, 20),
    publishedAt: clip(row.publishedAt, 40),
    deadline: clip(row.deadline, 40),
    url: clip(row.url, 600),
    source: clip(row.source, 20),
    noticeType: clip(row.noticeType, 120),
    cpvCodes: list(row.cpvCodes, 12, 20),
    matchedKeywords: list(row.matchedKeywords, 12, 60),
    tedId: clip(row.tedId, 40),
    competitionDocsUrl: clip(row.competitionDocsUrl, 600),
    decision: clip(row.decision, 20) || 'ubestemt',
    reviewedAt: row.reviewedAt || null,
    interestAt: row.interestAt || null,
    isNew: !!row.isNew,
    aiFit: Number.isFinite(score) && row.aiFit
      ? { score, reason: clip(row.aiFit.reason, 220), at: clip(row.aiFit.at, 40) }
      : null,
    geo: Number.isFinite(lat) && Number.isFinite(lng) && row.geo
      ? {
        lat,
        lng,
        label: clip(row.geo.label, 120),
        precision: clip(row.geo.precision, 20),
        source: clip(row.geo.source, 20),
      }
      : null,
  };
}

/** Leser et lagret treffdokument uten å stole på formen. */
export function readHitPack(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    notices: (Array.isArray(src.notices) ? src.notices : []).filter((row) => row && text(row.id)),
    syncedAt: src.syncedAt || null,
    queryKey: text(src.queryKey),
  };
}

function published(row) {
  return String(row?.publishedAt || '').slice(0, 10);
}

/** Rekkefølgen rader slippes i: utløpte ubehandlede, så eldste ubehandlede, så eldste vurderte. */
function dropOrder(rows, now) {
  const rank = (row) => {
    if ((row.decision || 'ubestemt') !== 'ubestemt') return 2;
    return noticeDeadlineExpired(row, now) ? 0 : 1;
  };
  return rows
    .map((row, index) => ({ index, rank: rank(row), at: published(row) }))
    .sort((a, b) => (a.rank - b.rank) || a.at.localeCompare(b.at))
    .map((item) => item.index);
}

function withoutFirst(meta, rows, order, count) {
  const removed = new Set(order.slice(0, count));
  return { ...meta, notices: rows.filter((_, index) => !removed.has(index)) };
}

/**
 * Treffene i en form som får plass i ett dokument.
 * Teksten kortes først. Hjelper ikke det, slippes færrest mulig rader.
 */
export function packHits(state, maxBytes = HIT_STORAGE_BYTES, now = new Date()) {
  const rows = (Array.isArray(state?.notices) ? state.notices : []).filter((row) => row && text(row.id));
  const meta = { syncedAt: state?.syncedAt || null, queryKey: text(state?.queryKey) };
  let pack = null;
  for (const limit of DESCRIPTION_LIMITS) {
    pack = { ...meta, notices: rows.map((row) => hitRow(row, limit)) };
    if (bytes(pack) <= maxBytes) return pack;
  }
  const order = dropOrder(pack.notices, now);
  let lo = 1;
  let hi = order.length;
  let best = order.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (bytes(withoutFirst(meta, pack.notices, order, mid)) <= maxBytes) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return withoutFirst(meta, pack.notices, order, best);
}

/** Kort nøkkel for å se om listen er endret siden sist den ble lagret. */
export function hitsSignature(pack) {
  const hits = readHitPack(pack);
  const rows = hits.notices.map((row) => [
    row.id,
    row.decision || '',
    row.reviewedAt || '',
    row.aiFit?.score ?? '',
    row.geo ? 1 : 0,
    row.isNew ? 1 : 0,
    String(row.description || '').length,
  ].join(':'));
  return `${hits.syncedAt || ''}|${hits.queryKey}|${rows.length}|${rows.join(',')}`;
}

function newerQueryKey(left, right) {
  const a = Date.parse(left.syncedAt || '') || 0;
  const b = Date.parse(right.syncedAt || '') || 0;
  return (b > a ? right.queryKey : left.queryKey) || right.queryKey || left.queryKey || '';
}

/** Slår sammen to lagrede trefflister. Ingen treff forsvinner, og nyeste vurdering vinner. */
export function mergeHitPacks(left, right, maxBytes = HIT_STORAGE_BYTES) {
  const a = readHitPack(left);
  const b = readHitPack(right);
  return packHits({
    notices: mergeNotices(a.notices, b.notices),
    syncedAt: laterIso(a.syncedAt, b.syncedAt),
    queryKey: newerQueryKey(a, b),
  }, maxBytes);
}

/** Legger lagrede treff inn i tilstanden. Vurderinger i hoveddokumentet beholdes. */
export function withHits(state, pack) {
  const hits = readHitPack(pack);
  const base = state && typeof state === 'object' ? state : {};
  if (!hits.notices.length) return base;
  return {
    ...base,
    notices: mergeNotices(hits.notices, base.notices || []),
    syncedAt: laterIso(base.syncedAt, hits.syncedAt),
    queryKey: newerQueryKey({ syncedAt: base.syncedAt, queryKey: text(base.queryKey) }, hits),
  };
}

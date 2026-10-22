import { areaById, cpvByCode } from './catalog.js';
import { normalizeFormTemplates, normalizeBidWork } from './bidLibrary.js';
import { normalizeReviewNotes } from './reviewNotes.js';
import { normalizeCustomers } from './customers.js';
import { deadlineHasPassed, normalizeAudit, normalizeBidRecord, normalizeContracts, normalizeStrategy, STRATEGY_ITEMS } from './lifecycle.js';
import { classifyNotice, ensureProfiles, normalizeBidDesk, normalizeLibrary, normalizeNoticeDesk, rememberActiveProfile } from './desk.js';
import { mergeAgreementCases, normalizeAgreementCases } from './agreementCase.js';
import { applyIndexDeletions } from './indexDeletion.js';

function text(value) {
  return String(value || '').trim();
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

export function normalizeCpvCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 2) return '';
  return digits.slice(0, 8).padEnd(8, '0');
}

export function normalizeCpvList(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const code = normalizeCpvCode(typeof row === 'string' ? row : row?.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const known = cpvByCode(code);
    out.push({
      code,
      label: text(row?.label) || known?.label || `CPV ${code}`,
    });
  }
  return out;
}

export function normalizeDepartmentAreas(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = text(row?.id);
    const name = text(row?.name || row?.navn).slice(0, 80);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const nationwide = row?.nationwide === true;
    out.push({
      id,
      name,
      nationwide,
      areas: nationwide ? [] : normalizeAreas(row?.areas),
    });
  }
  return out;
}

/** Kobler lagrede områder til avdelingene som finnes nå. */
export function alignDepartmentAreas(saved, departments) {
  const prev = normalizeDepartmentAreas(saved);
  const out = [];
  const seen = new Set();
  for (const unit of Array.isArray(departments) ? departments : []) {
    const id = text(unit?.id);
    const name = text(unit?.name || unit?.navn).slice(0, 80);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const found = prev.find((row) => row.id === id);
    out.push(found
      ? { ...found, name }
      : { id, name, nationwide: false, areas: [] });
  }
  return out;
}

export function normalizeAreas(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = text(typeof row === 'string' ? row : row?.id);
    const known = areaById(id);
    if (!known || seen.has(known.id)) continue;
    seen.add(known.id);
    out.push({ id: known.id, name: known.name });
  }
  return out;
}

export function emptyAnbudState() {
  return {
    watch: {
      companyName: '',
      cpvCodes: [],
      keywords: [],
      areas: [],
      departmentAreas: [],
      nationwide: false,
      savedAt: null,
      orgnr: '',
      cpvSource: '',
      profile: normalizeWatchProfile(null),
    },
    notices: [],
    bids: [],
    contracts: [],
    /** Tombstones slik at permanent slettede avtaler ikke gjenoppstår ved merge. */
    deletedContracts: [],
    customers: [],
    audit: [],
    formTemplates: null,
    formTemplatesAt: '',
    agreementCases: [],
    supplierProfile: null,
    profiles: [],
    activeProfileId: '',
    library: [],
    syncedAt: null,
    queryKey: '',
  };
}

function normalizeDeletedContract(row) {
  if (!row || typeof row !== 'object') return null;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    title: text(row.title).slice(0, 160),
    deletedAt: text(row.deletedAt) || '',
  };
}

function mergeDeletedContracts(left, right) {
  const map = new Map();
  for (const row of [...(left || []), ...(right || [])]) {
    const next = normalizeDeletedContract(row);
    if (!next) continue;
    const prev = map.get(next.id);
    if (!prev) {
      map.set(next.id, next);
      continue;
    }
    const tPrev = Date.parse(prev.deletedAt || '') || 0;
    const tNext = Date.parse(next.deletedAt || '') || 0;
    map.set(next.id, tNext >= tPrev ? next : prev);
  }
  return [...map.values()];
}

export function normalizeAnbudState(raw) {
  const base = emptyAnbudState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const watch = src.watch && typeof src.watch === 'object' ? src.watch : {};
  const normalized = {
    watch: {
      ...base.watch,
      ...watch,
      cpvCodes: Array.isArray(watch.cpvCodes) ? watch.cpvCodes : [],
      areas: Array.isArray(watch.areas) ? watch.areas : [],
      departmentAreas: normalizeDepartmentAreas(watch.departmentAreas),
      channels: normalizeChannels(watch.channels),
      notify: normalizeNotify(watch.notify),
      emails: normalizeEmails(watch.emails),
      naeringskoder: normalizeTrades(watch.naeringskoder),
      keywords: normalizeKeywords(watch.keywords),
      profile: normalizeWatchProfile(watch.profile),
    },
    notices: Array.isArray(src.notices) ? src.notices.map(normalizeNotice) : [],
    bids: (Array.isArray(src.bids) ? src.bids : []).map((row) => normalizeBidDesk(normalizeBidWork(normalizeBidRecord(row)))),
    contracts: normalizeContracts(src.contracts),
    deletedContracts: (Array.isArray(src.deletedContracts) ? src.deletedContracts : [])
      .map(normalizeDeletedContract)
      .filter(Boolean),
    customers: normalizeCustomers(src.customers),
    audit: normalizeAudit(src.audit),
    formTemplates: normalizeFormTemplates(src.formTemplates),
    formTemplatesAt: text(src.formTemplatesAt).slice(0, 40),
    agreementCases: normalizeAgreementCases(src.agreementCases),
    supplierProfile: normalizeSupplierProfile(src.supplierProfile),
    profiles: Array.isArray(src.profiles) ? src.profiles : [],
    activeProfileId: text(src.activeProfileId),
    library: normalizeLibrary(src.library),
    syncedAt: src.syncedAt || null,
    queryKey: text(src.queryKey),
  };
  const deletedIds = new Set(normalized.deletedContracts.map((row) => row.id));
  if (deletedIds.size) {
    normalized.contracts = normalized.contracts.filter((row) => row?.id && !deletedIds.has(row.id));
  }
  return ensureProfiles(normalized);
}

const DECISIONS = new Set(['ubestemt', 'aktuell', 'arkiv', 'forkastet', 'ikke', 'tilbud']);

/** Neste vurdering. Listen veksler av igjen. Kartet setter verdien og lar den stå. */
export function nextNoticeDecision(current, requested, { toggle = true } = {}) {
  const now = DECISIONS.has(current) ? current : 'ubestemt';
  if (!DECISIONS.has(requested) || requested === 'tilbud') return now;
  if (toggle && now === requested) return 'ubestemt';
  return requested;
}

/** Samme merking innen vinduet er ett trykk, ikke en ny vurdering. */
export function sameMarkGesture(previous, key, now, windowMs = 800) {
  if (!previous || previous.key !== key) return false;
  return (Number(now) - Number(previous.at)) < windowMs;
}

function laterIso(left, right) {
  const a = Date.parse(left || '') || 0;
  const b = Date.parse(right || '') || 0;
  if (b > a) return right || null;
  return left || right || null;
}

function isDecided(decision) {
  return !!decision && decision !== 'ubestemt';
}

/** Stabil nøkkel når Doffin/TED bytter id, men det er samme kunngjøring. */
export function noticeSignature(notice) {
  const title = fold(notice?.title || notice?.heading || '');
  const buyer = fold(typeof notice?.buyer === 'string' ? notice.buyer : '');
  const published = String(notice?.publishedAt || notice?.publicationDate || '').slice(0, 10);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(published)) return '';
  return `${title}|${buyer}|${published}`;
}

function tedNoticeKey(row) {
  const id = text(row?.id);
  if (id.startsWith('ted-')) return `ted:${id.slice(4)}`;
  const raw = `${text(row?.tedId)} ${text(row?.dossier?.tedUrl)}`;
  const match = raw.match(/(\d{4,}-\d{4})/);
  return match ? `ted:${match[1]}` : '';
}

function noticeKeys(row) {
  const id = text(row?.id);
  const sig = noticeSignature(row);
  return [id, sig, tedNoticeKey(row)].filter(Boolean);
}

function pickReviewedNotice(left, right) {
  const a = normalizeNotice(left);
  const b = normalizeNotice(right);
  const aTime = Date.parse(a.reviewedAt || '') || 0;
  const bTime = Date.parse(b.reviewedAt || '') || 0;
  const winner = bTime > aTime
    ? b
    : aTime > bTime
      ? a
      : (a.reviewedAt && b.reviewedAt
        ? b
        : (isDecided(b.decision) && !isDecided(a.decision) ? b : a));
  const other = winner === a ? b : a;
  return {
    ...other,
    ...winner,
    id: winner.id || other.id,
    decision: DECISIONS.has(winner.decision) ? winner.decision : (other.decision || 'ubestemt'),
    reviewedAt: winner.reviewedAt || other.reviewedAt || null,
    interestAt: winner.interestAt || other.interestAt || null,
    interest: winner.interest || other.interest || null,
    dossier: winner.dossier || other.dossier || null,
    consideration: winner.consideration || other.consideration || null,
    brief: winner.brief || other.brief || null,
    excerpts: (winner.excerpts || other.excerpts || []).slice(0, 3),
    updates: [...(other.updates || []), ...(winner.updates || [])].slice(-20),
    awardContext: winner.awardContext || other.awardContext || null,
    qualification: winner.qualification || other.qualification || [],
    frameworkId: winner.frameworkId || other.frameworkId || '',
    kind: winner.kind || other.kind || '',
    profileIds: [...new Set([...(other.profileIds || []), ...(winner.profileIds || [])])],
    reviewNotes: winner.reviewNotes?.length ? winner.reviewNotes : (other.reviewNotes || []),
    isNew: isDecided(winner.decision) ? false : !!(winner.isNew || other.isNew),
    matchedKeywords: normalizeKeywords([...(other.matchedKeywords || []), ...(winner.matchedKeywords || [])]),
  };
}

function mergeNoticeLists(left, right) {
  const byKey = new Map();
  const ingest = (list) => {
    for (const row of (Array.isArray(list) ? list : [])) {
      const notice = normalizeNotice(row);
      if (!notice.id && !noticeSignature(notice)) continue;
      const existing = noticeKeys(notice).map((key) => byKey.get(key)).find(Boolean);
      const picked = existing ? pickReviewedNotice(existing, notice) : notice;
      for (const key of noticeKeys(picked)) byKey.set(key, picked);
    }
  };
  ingest(left);
  ingest(right);
  const seen = new Set();
  const notices = [];
  for (const row of byKey.values()) {
    const id = row.id || noticeSignature(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    notices.push(row);
  }
  notices.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  return notices;
}

function mergeById(left, right) {
  const map = new Map();
  for (const row of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    const id = text(row?.id);
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, prev ? { ...prev, ...row, id } : row);
  }
  return [...map.values()];
}

function pickWatch(left, right) {
  const a = left && typeof left === 'object' ? left : {};
  const b = right && typeof right === 'object' ? right : {};
  const useRight = (Date.parse(b.savedAt || '') || 0) > (Date.parse(a.savedAt || '') || 0);
  const src = useRight ? b : (a.savedAt || a.companyName ? a : b);
  return {
    ...a,
    ...src,
    cpvCodes: Array.isArray(src.cpvCodes) && src.cpvCodes.length ? src.cpvCodes : (a.cpvCodes || b.cpvCodes || []),
    areas: Array.isArray(src.areas) ? src.areas : (a.areas || []),
    departmentAreas: normalizeDepartmentAreas(
      Array.isArray(src.departmentAreas) ? src.departmentAreas : (a.departmentAreas || b.departmentAreas),
    ),
    channels: normalizeChannels(src.channels || a.channels || b.channels),
    notify: normalizeNotify(src.notify || a.notify),
    emails: normalizeEmails(src.emails || a.emails),
    naeringskoder: normalizeTrades(src.naeringskoder || a.naeringskoder),
    keywords: normalizeKeywords(src.keywords || a.keywords),
    profile: normalizeWatchProfile(src.profile || a.profile || b.profile),
  };
}

function httpUrl(value) {
  const href = String(value || '').trim();
  return /^https?:\/\//i.test(href) ? href : '';
}

function fileKeepScore(doc) {
  if (!doc) return -1;
  let score = 0;
  if (httpUrl(doc.url)) score += 4;
  if (String(doc.storagePath || '').trim()) score += 2;
  if (String(doc.dataUrl || '').startsWith('data:')) score += 1;
  return score;
}

function preferKeptFile(current, next) {
  if (!current) return next;
  if (!next) return current;
  return fileKeepScore(next) >= fileKeepScore(current) ? next : current;
}

function preferHttpUrl(left, right) {
  const a = httpUrl(left);
  const b = httpUrl(right);
  if (a.length >= b.length) return a || b;
  return b || a;
}

function unionRows(groups, id, key, row, prefer) {
  if (!row?.id) return;
  const bucket = groups.get(id) || {};
  const list = bucket[key] || [];
  const index = list.findIndex((item) => item?.id === row.id);
  if (index === -1) list.push(row);
  else list[index] = prefer(list[index], row);
  bucket[key] = list;
  groups.set(id, bucket);
}

function preferNewerCase(left, right) {
  const lRev = Number(left?.revision) || 0;
  const rRev = Number(right?.revision) || 0;
  const sent = left?.status === 'sendt' ? left : (right?.status === 'sendt' ? right : null);
  const winner = rRev >= lRev ? right : left;
  const other = winner === right ? left : right;
  if (sent) {
    return {
      ...other,
      ...sent,
      revision: Math.max(lRev, rRev),
      letterPlain: sent.letterPlain || other?.letterPlain || '',
      documents: (sent.documents || []).length >= (other?.documents || []).length ? sent.documents : other.documents,
    };
  }
  return {
    ...other,
    ...winner,
    revision: Math.max(lRev, rRev),
    letterPlain: (winner?.letterPlain || '').length >= (other?.letterPlain || '').length ? winner.letterPlain : other.letterPlain,
  };
}

function preferRegulation(left, right) {
  const richer = String(right?.letterPlain || '').length >= String(left?.letterPlain || '').length ? { ...left, ...right } : { ...right, ...left };
  const sent = left?.sentAt ? left : (right?.sentAt ? right : null);
  if (!sent) return richer;
  return { ...richer, sentAt: sent.sentAt, sentTo: sent.sentTo || richer.sentTo || '' };
}

function preferPrice(left, right) {
  return {
    ...left,
    ...right,
    validTo: right?.validTo || left?.validTo || '',
    rateExVat: Number(right?.rateExVat) || Number(left?.rateExVat) || 0,
  };
}

function mergeContractFiles(left, right) {
  const merged = mergeById(left, right);
  const groups = new Map();
  for (const row of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!row?.id) continue;
    (row.indexCases || []).forEach((item) => unionRows(groups, row.id, 'cases', item, preferNewerCase));
    (row.priceVersions || []).forEach((item) => unionRows(groups, row.id, 'prices', item, preferPrice));
    (row.regulations || []).forEach((item) => unionRows(groups, row.id, 'regs', item, preferRegulation));
  }
  const deletedCases = new Map();
  for (const row of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!row?.id) continue;
    const ids = Array.isArray(row.deletedIndexCaseIds) ? row.deletedIndexCaseIds : [];
    if (!ids.length) continue;
    const set = deletedCases.get(row.id) || new Set();
    ids.forEach((id) => {
      const value = String(id || '').trim();
      if (value) set.add(value);
    });
    deletedCases.set(row.id, set);
  }
  const kept = new Map();
  for (const row of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    for (const doc of row?.documents || []) {
      if (!doc?.id) continue;
      if (!httpUrl(doc.url) && !String(doc.storagePath || '').trim() && !doc.dataUrl && !doc.uri) continue;
      const key = `${row.id}:${doc.id}`;
      kept.set(key, preferKeptFile(kept.get(key), doc));
    }
  }
  return merged.map((row) => ({
    ...row,
    ...applyIndexDeletions({
      indexCases: groups.get(row.id)?.cases || row.indexCases || [],
      regulations: groups.get(row.id)?.regs || row.regulations || [],
      priceVersions: groups.get(row.id)?.prices || row.priceVersions || [],
      deletedIndexCaseIds: [...(deletedCases.get(row.id) || [])].slice(-200),
    }),
    documents: (row.documents || []).map((doc) => {
      const extra = kept.get(`${row.id}:${doc.id}`);
      if (!extra) return doc;
      const uri = String(doc.uri || '').startsWith('blob:')
        ? (String(extra.uri || '').startsWith('blob:') ? '' : (extra.uri || ''))
        : (doc.uri || extra.uri || '');
      return {
        ...doc,
        dataUrl: doc.dataUrl || extra.dataUrl || '',
        uri: String(uri).startsWith('blob:') ? '' : uri,
        url: preferHttpUrl(doc.url, extra.url),
        storagePath: String(doc.storagePath || extra.storagePath || '').trim(),
      };
    }),
  }));
}

/**
 * Skjemamalene er en liste som kan slettes.
 * Nyeste formTemplatesAt vinner hele listen. Uten tidsstempel slås listene sammen på id,
 * slik at en gammel lagring ikke skjuler maler som bare finnes på den andre siden.
 */
function mergeFormTemplates(left, right) {
  const aAt = Date.parse(left?.formTemplatesAt || '') || 0;
  const bAt = Date.parse(right?.formTemplatesAt || '') || 0;
  if (aAt !== bAt) {
    const winner = aAt > bAt ? left : right;
    return {
      formTemplates: winner.formTemplates,
      formTemplatesAt: winner.formTemplatesAt || '',
    };
  }
  if (aAt) {
    return {
      formTemplates: right.formTemplates,
      formTemplatesAt: right.formTemplatesAt || '',
    };
  }
  const map = new Map();
  for (const row of left?.formTemplates || []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of right?.formTemplates || []) {
    if (row?.id) map.set(row.id, row);
  }
  return {
    formTemplates: [...map.values()].slice(0, 80),
    formTemplatesAt: '',
  };
}

/** Slår sammen to lagrede tilstander uten å nullstille vurderinger. */
export function mergeAnbudStates(left, right) {
  const a = normalizeAnbudState(left);
  const b = normalizeAnbudState(right);
  const aSync = Date.parse(a.syncedAt || '') || 0;
  const bSync = Date.parse(b.syncedAt || '') || 0;
  const deletedContracts = mergeDeletedContracts(a.deletedContracts, b.deletedContracts);
  const deletedIds = new Set(deletedContracts.map((row) => row.id));
  const contracts = mergeContractFiles(a.contracts, b.contracts)
    .filter((row) => row?.id && !deletedIds.has(row.id));
  return normalizeAnbudState({
    watch: pickWatch(a.watch, b.watch),
    notices: mergeNoticeLists(a.notices, b.notices),
    bids: mergeById(a.bids, b.bids),
    contracts,
    deletedContracts,
    customers: mergeById(a.customers, b.customers),
    audit: aSync >= bSync ? (a.audit.length ? a.audit : b.audit) : (b.audit.length ? b.audit : a.audit),
    ...mergeFormTemplates(a, b),
    agreementCases: mergeAgreementCases(a.agreementCases, b.agreementCases),
    profiles: mergeById(a.profiles, b.profiles),
    library: mergeById(a.library, b.library),
    activeProfileId: b.activeProfileId || a.activeProfileId || '',
    supplierProfile: (Date.parse(b.supplierProfile?.savedAt || '') || 0) > (Date.parse(a.supplierProfile?.savedAt || '') || 0)
      ? b.supplierProfile
      : (a.supplierProfile || b.supplierProfile),
    syncedAt: laterIso(a.syncedAt, b.syncedAt),
    queryKey: (bSync > aSync ? b.queryKey : a.queryKey) || b.queryKey || a.queryKey,
  });
}

function stripHeavy(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    try {
      return value.map((item) => stripHeavy(item, seen));
    } finally {
      seen.delete(value);
    }
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  const out = {};
  try {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'dataUrl' || key === 'base64') continue;
      out[key] = stripHeavy(item, seen);
    }
  } finally {
    seen.delete(value);
  }
  return out;
}

/** Fjerner tunge filinnhold slik at valg overlever lagringsgrenser. */
export function compactAnbudState(raw) {
  return stripHeavy(normalizeAnbudState(raw));
}

/** Firestore sitt dokumenttak, med plass til tidsstempel og digest-flagget. */
export const ANBUD_STORAGE_BYTES = 800_000;

function asPlain(value) {
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto && proto !== Object.prototype && typeof value.toJSON === 'function') {
    try {
      return value.toJSON();
    } catch {
      return null;
    }
  }
  return value;
}

function clipDeep(value, max, seen) {
  const plain = asPlain(value);
  if (typeof plain === 'string') return plain.length > max ? plain.slice(0, max) : plain;
  if (!plain || typeof plain !== 'object') return plain;
  if (seen.has(plain)) return null;
  seen.add(plain);
  try {
    if (Array.isArray(plain)) return plain.map((item) => clipDeep(item, max, seen));
    const out = {};
    for (const [key, item] of Object.entries(plain)) {
      if (item === undefined || typeof item === 'function') continue;
      if (key === 'dataUrl' || key === 'base64' || key === 'bytes') continue;
      out[key] = clipDeep(item, max, seen);
    }
    return out;
  } finally {
    seen.delete(plain);
  }
}

function decidedNotice(row) {
  return !!row?.decision && row.decision !== 'ubestemt';
}

function lightNotice(row, limit) {
  const clipped = clipDeep(row, decidedNotice(row) ? Math.max(limit, 1200) : limit, new WeakSet());
  if (!clipped || decidedNotice(clipped) || limit > 600) return clipped;
  const { description, ...rest } = clipped;
  delete rest.dossier;
  delete rest.excerpts;
  delete rest.updates;
  delete rest.brief;
  return {
    ...rest,
    description: String(description || '').slice(0, 180),
  };
}

function clipState(state, limit) {
  return {
    ...state,
    watch: clipDeep(state.watch, Math.max(limit, 4000), new WeakSet()),
    notices: (state.notices || []).map((row) => lightNotice(row, limit)),
    bids: clipDeep(state.bids || [], limit, new WeakSet()),
    contracts: clipDeep(state.contracts || [], limit, new WeakSet()),
    customers: clipDeep(state.customers || [], Math.max(limit, 400), new WeakSet()),
    agreementCases: clipDeep(state.agreementCases || [], Math.max(limit, 800), new WeakSet()),
    audit: clipDeep((state.audit || []).slice(0, 100), Math.max(limit, 200), new WeakSet()),
    library: clipDeep(state.library || [], limit, new WeakSet()),
    formTemplates: clipDeep(state.formTemplates, limit, new WeakSet()),
    profiles: clipDeep(state.profiles || [], Math.max(limit, 2000), new WeakSet()),
    supplierProfile: clipDeep(state.supplierProfile, Math.max(limit, 400), new WeakSet()),
  };
}

function encodedBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
    return json.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function dropOldestUndecided(state, maxBytes) {
  let notices = [...(state.notices || [])];
  let next = { ...state, notices };
  for (let round = 0; round < 40 && encodedBytes(next) > maxBytes; round += 1) {
    const open = [];
    notices.forEach((row, index) => {
      if (!decidedNotice(row)) open.push(index);
    });
    if (!open.length) break;
    const step = encodedBytes(next) - maxBytes > 100_000
      ? Math.max(1, Math.ceil(open.length / 2))
      : Math.max(1, Math.ceil(open.length * 0.4));
    const remove = new Set(open.slice(-step));
    notices = notices.filter((_, index) => !remove.has(index));
    next = { ...state, notices };
  }
  return next;
}

/** Identitet og vurdering, uten grunnlagstekst. Brukes bare når dokumentet ellers ikke får plass. */
function slimDecidedNotice(row) {
  return {
    id: row.id,
    title: String(row.title || '').slice(0, 180),
    buyer: String(row.buyer || '').slice(0, 120),
    decision: row.decision,
    reviewedAt: row.reviewedAt || null,
    interestAt: row.interestAt || null,
    publishedAt: row.publishedAt || '',
    deadline: row.deadline || '',
    url: row.url || '',
    source: row.source || '',
    status: row.status || '',
    places: Array.isArray(row.places) ? row.places.slice(0, 4) : [],
    cpvCodes: Array.isArray(row.cpvCodes) ? row.cpvCodes.slice(0, 8) : [],
    isNew: false,
  };
}

function shrinkToBudget(state, maxBytes) {
  let next = dropOldestUndecided(state, maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = {
    ...next,
    contracts: (next.contracts || []).map((row) => ({
      ...row,
      documents: (row.documents || []).map((doc) => ({
        ...doc,
        text: String(doc.text || '').slice(0, 180),
      })),
    })),
    bids: (next.bids || []).map((bid) => ({
      ...bid,
      dossier: bid.dossier ? {
        id: bid.dossier.id,
        title: bid.dossier.title,
        submissionDeadline: bid.dossier.submissionDeadline,
        documentsUrl: bid.dossier.documentsUrl,
        noticeUrl: bid.dossier.noticeUrl,
      } : null,
      files: (bid.files || []).map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        storagePath: file.storagePath,
        mimeType: file.mimeType,
      })),
    })),
  };
  if (encodedBytes(next) <= maxBytes) return next;
  next = dropOldestUndecided(next, maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  const notices = (next.notices || []).map((row) => (decidedNotice(row) ? slimDecidedNotice(row) : row));
  return dropOldestUndecided({ ...next, notices }, maxBytes);
}

/** Største prefiks av en liste som fortsatt holder seg innenfor budsjettet. */
function fitPrefix(state, key, maxBytes) {
  const rows = Array.isArray(state?.[key]) ? state[key] : [];
  if (encodedBytes(state) <= maxBytes) return state;
  let lo = 0;
  let hi = rows.length;
  let best = { ...state, [key]: [] };
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = { ...state, [key]: rows.slice(0, mid) };
    if (encodedBytes(candidate) <= maxBytes) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function stripSecondary(state) {
  return {
    ...state,
    library: [],
    audit: (state.audit || []).slice(-20).map((row) => ({
      id: row?.id || '',
      at: row?.at || '',
      action: String(row?.action || '').slice(0, 40),
      detail: String(row?.detail || '').slice(0, 80),
      bidId: row?.bidId || '',
      contractId: row?.contractId || '',
    })),
    contracts: (state.contracts || []).map((row) => ({
      ...row,
      documents: (row.documents || []).slice(0, 20).map((doc) => ({
        id: doc.id,
        name: String(doc.name || doc.title || '').slice(0, 180),
        url: String(doc.url || '').slice(0, 2000),
        storagePath: String(doc.storagePath || '').slice(0, 500),
        mimeType: doc.mimeType || '',
        role: doc.role || '',
        size: Number(doc.size) || 0,
      })),
      regulations: (row.regulations || []).slice(0, 8).map((item) => ({
        id: item.id,
        savedAt: item.savedAt,
        before: item.before,
        after: item.after,
        changePercent: item.changePercent,
      })),
    })),
    bids: (state.bids || []).map((bid) => ({
      ...bid,
      dossier: bid.dossier ? { id: bid.dossier.id, title: bid.dossier.title } : null,
      files: (bid.files || []).slice(0, 12).map((file) => ({
        id: file.id,
        name: file.name,
        url: file.url,
        storagePath: file.storagePath,
      })),
    })),
    formTemplates: Array.isArray(state.formTemplates)
      ? state.formTemplates.slice(0, 40).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
      }))
      : state.formTemplates,
    profiles: (state.profiles || []).slice(0, 12),
    notices: (state.notices || []).map((row) => slimDecidedNotice(row)),
  };
}

function bareWatch(state) {
  return {
    watch: state.watch,
    notices: [],
    bids: [],
    contracts: [],
    deletedContracts: (state.deletedContracts || []).slice(0, 80),
    customers: [],
    audit: [],
    formTemplates: null,
    formTemplatesAt: state.formTemplatesAt || '',
    agreementCases: [],
    supplierProfile: state.supplierProfile || null,
    profiles: [],
    activeProfileId: state.activeProfileId || '',
    library: [],
    syncedAt: state.syncedAt || null,
    queryKey: state.queryKey || '',
  };
}

/**
 * Siste pass: budsjettet skal faktisk holdes.
 * Kundelisten kan kortes ned her — registeret lagres for seg.
 * Vurderte treff beholdes så lenge de får plass.
 */
function enforceStorageBudget(state, maxBytes) {
  if (encodedBytes(state) <= maxBytes) return state;
  const customers = state.customers || [];
  let next = fitPrefix(state, 'customers', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = stripSecondary({ ...next, customers });
  if (encodedBytes(next) <= maxBytes) return next;
  next = fitPrefix(next, 'customers', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = fitPrefix(next, 'contracts', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = fitPrefix(next, 'bids', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = fitPrefix(next, 'agreementCases', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  next = fitPrefix(next, 'notices', maxBytes);
  if (encodedBytes(next) <= maxBytes) return next;
  const bare = bareWatch(next);
  if (encodedBytes(bare) <= maxBytes) return bare;
  return {
    ...bare,
    watch: clipDeep(bare.watch, 400, new WeakSet()),
    supplierProfile: null,
    deletedContracts: [],
    queryKey: '',
  };
}

/**
 * Tilstand som får plass i Firestore og i nettleseren.
 * Vurderte treff (aktuelle og andre avkrysninger) blir stående selv om et nytt søk
 * har færre rader. Filinnhold og gamle ubehandlede treff slippes når plassen er brukt opp.
 */
export function fitAnbudState(raw, maxBytes = ANBUD_STORAGE_BYTES) {
  const base = compactAnbudState(raw);
  const customers = base.customers || [];
  const keepCustomers = (state) => {
    if ((state?.customers || []).length >= customers.length) return state;
    const kept = { ...state, customers };
    return encodedBytes(kept) <= maxBytes ? kept : state;
  };
  let fitted = base;
  for (const limit of [8000, 2000, 600, 160]) {
    fitted = clipState(base, limit);
    if (encodedBytes(fitted) <= maxBytes) return keepCustomers(fitted);
  }
  fitted = keepCustomers(shrinkToBudget(fitted, maxBytes));
  if (encodedBytes(fitted) <= maxBytes) return fitted;
  return enforceStorageBudget(fitted, maxBytes);
}

export const LOGIN_PORTALS = [
  { id: 'mercell', name: 'Mercell', url: 'https://app.mercell.com/auth/login?bidding' },
  { id: 'eusupply', name: 'EU Supply', url: 'https://eu.eu-supply.com/login.asp' },
  { id: 'tendsign', name: 'TendSign', url: 'https://tendsign.no/login.aspx' },
];

export function portalFromUrl(value) {
  const raw = text(value);
  if (!raw) return { name: '', url: '' };
  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return { name: '', url: '' };
  }
  if (url.protocol !== 'https:') return { name: '', url: '' };
  url.username = '';
  url.password = '';
  const host = url.hostname.replace(/^www\./, '');
  const known = /mercell/i.test(host)
    ? 'Mercell'
    : /eu-supply|eusupply/i.test(host)
      ? 'EU Supply'
      : /tendsign/i.test(host)
        ? 'TendSign'
        : host;
  return { name: known, url: url.toString() };
}

function normalizeSupplierProfile(raw) {
  if (!raw || typeof raw !== 'object' || !text(raw.username)) return null;
  const portal = portalFromUrl(raw.portalUrl || raw.url);
  return {
    companyName: text(raw.companyName),
    orgnr: text(raw.orgnr).replace(/\D/g, '').slice(0, 9),
    contactName: text(raw.contactName),
    email: text(raw.email).toLowerCase(),
    phone: text(raw.phone),
    portal: text(raw.portal) || portal.name,
    portalUrl: portal.url,
    username: text(raw.username),
    savedAt: raw.savedAt || null,
  };
}

export function saveSupplierProfile(state, input) {
  const contactName = text(input?.contactName);
  const email = text(input?.email).toLowerCase();
  const username = text(input?.username);
  const portal = portalFromUrl(input?.portalUrl);
  if (!contactName) return fail(state, 'Kontaktperson må fylles ut.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(state, 'E-post til profilen må være gyldig.');
  if (!portal.url) return fail(state, 'Innloggingsportalen må være en nettadresse.');
  if (!username) return fail(state, 'Brukernavn hos innleveringsportalen må fylles ut.');
  return ok({
    ...state,
    supplierProfile: {
      companyName: text(input?.companyName),
      orgnr: text(input?.orgnr).replace(/\D/g, '').slice(0, 9),
      contactName,
      email,
      phone: text(input?.phone),
      portal: text(input?.portal) || portal.name,
      portalUrl: portal.url,
      username,
      savedAt: new Date().toISOString(),
    },
  });
}

export function saveTenderWatch(state, input) {
  const companyName = text(input?.companyName);
  if (!companyName) return fail(state, 'Bedriftsnavn må fylles ut.');
  const cpvCodes = normalizeCpvList(input?.cpvCodes);
  if (cpvCodes.length > 20) return fail(state, 'Maks 20 CPV-koder i ett varsel.');
  const keywords = normalizeKeywords(input?.keywords);
  const profile = normalizeWatchProfile(input?.profile ?? state.watch?.profile);
  const hasSignal = cpvCodes.length
    || keywords.length
    || profile.keywords.length
    || profile.description
    || profile.website
    || profile.summary;
  if (!hasSignal) return fail(state, 'Legg inn CPV, søkeord eller en bedriftsbeskrivelse før du lagrer.');
  const nationwide = !!input?.nationwide;
  const areas = nationwide ? [] : normalizeAreas(input?.areas);
  if (!nationwide && !areas.length) return fail(state, 'Velg minst ett fylke, eller hele Norge.');
  const departmentAreas = normalizeDepartmentAreas(
    input?.departmentAreas ?? state.watch?.departmentAreas,
  );
  const saved = ok({
    ...state,
    watch: {
      companyName,
      cpvCodes,
      areas,
      departmentAreas,
      nationwide,
      savedAt: new Date().toISOString(),
      orgnr: text(input?.orgnr).replace(/\D/g, '').slice(0, 9),
      cpvSource: text(input?.cpvSource),
      channels: normalizeChannels(input?.channels),
      notify: normalizeNotify(input?.notify),
      emails: normalizeEmails(input?.emails),
      naeringskoder: normalizeTrades(input?.naeringskoder),
      keywords,
      profile,
    },
  });
  if (!saved.ok) return saved;
  return { ...saved, state: rememberActiveProfile(saved.state) };
}

function normalizeChannels(input) {
  const allowed = new Set(['doffin', 'ted']);
  const rows = (Array.isArray(input) ? input : ['doffin', 'ted'])
    .map((row) => text(row).toLowerCase())
    .filter((row) => allowed.has(row));
  return rows.length ? [...new Set(rows)] : ['doffin'];
}

function normalizeNotify(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    push: src.push !== false,
    varsel: src.varsel !== false,
    email: src.email === true,
  };
}

function normalizeEmails(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const email = text(row).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= 10) break;
  }
  return out;
}

function normalizeTrades(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const value = text(row);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function normalizeKeywords(input) {
  const rows = Array.isArray(input) ? input : String(input || '').split(/[,;\n]/);
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const value = text(row).replace(/\s+/g, ' ');
    const key = fold(value);
    if (key.length < 2 || value.length > 60 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

function normalizeWebsite(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const href = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(href.protocol)) return raw.slice(0, 300);
    href.username = '';
    href.password = '';
    return href.toString().slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export function normalizeWatchProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    description: text(src.description).slice(0, 2000),
    website: normalizeWebsite(src.website),
    summary: text(src.summary).slice(0, 800),
    keywords: normalizeKeywords(src.keywords).slice(0, 30),
    updatedAt: text(src.updatedAt),
  };
}

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Området søket faktisk bruker. Avdelinger med egne fylker avgrenser treffene. */
export function searchCoverage(watch, departmentId = '') {
  const rows = normalizeDepartmentAreas(watch?.departmentAreas);
  const configured = rows.filter((row) => row.nationwide || row.areas.length);
  const company = {
    nationwide: !!watch?.nationwide,
    areas: watch?.nationwide ? [] : normalizeAreas(watch?.areas),
    departmentId: '',
    label: '',
  };
  if (!configured.length && !departmentId) return company;
  if (departmentId) {
    const one = rows.find((row) => row.id === departmentId);
    if (!one || (!one.nationwide && !one.areas.length)) {
      return { nationwide: false, areas: [], departmentId, label: one?.name || '' };
    }
    return {
      nationwide: !!one.nationwide,
      areas: one.nationwide ? [] : one.areas,
      departmentId: one.id,
      label: one.name,
    };
  }
  if (configured.some((row) => row.nationwide)) {
    return { nationwide: true, areas: [], departmentId: '', label: 'Alle avdelinger' };
  }
  return {
    nationwide: false,
    areas: normalizeAreas(configured.flatMap((row) => row.areas)),
    departmentId: '',
    label: 'Alle avdelinger',
  };
}

export function noticeInCoverage(notice, coverage) {
  if (!coverage || coverage.nationwide) return true;
  const areas = Array.isArray(coverage.areas) ? coverage.areas : [];
  if (!areas.length) return false;
  return areas.some((area) => noticeInArea(notice, area));
}

export function watchQuery(watch) {
  if (!watch?.companyName) return null;
  const keywords = normalizeKeywords([
    ...(watch.keywords || []),
    ...(watch.profile?.keywords || []),
  ]);
  if (!watch.cpvCodes?.length && !keywords.length) return null;
  const coverage = searchCoverage(watch);
  if (!coverage.nationwide && !coverage.areas.length) return null;
  return {
    cpvCodes: (watch.cpvCodes || []).map((row) => row.code),
    locationIds: coverage.nationwide ? [] : coverage.areas.map((row) => row.id),
    keywords,
  };
}

export function watchFingerprint(watch) {
  const cpv = (watch?.cpvCodes || []).map((row) => text(row?.code || row)).filter(Boolean).sort();
  const coverage = searchCoverage(watch);
  const areas = coverage.nationwide ? ['*'] : coverage.areas.map((row) => text(row?.id || row)).filter(Boolean).sort();
  const channels = (Array.isArray(watch?.channels) ? watch.channels : []).map((row) => text(row)).filter(Boolean).sort();
  const keywords = normalizeKeywords([
    ...(watch?.keywords || []),
    ...(watch?.profile?.keywords || []),
  ]).map((row) => fold(row)).sort();
  return JSON.stringify({ v: 2, cpv, areas, channels, keywords });
}

export function latestPublished(notices) {
  const dates = (Array.isArray(notices) ? notices : [])
    .map((row) => String(row?.publishedAt || '').slice(0, 10))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row))
    .sort();
  return dates.length ? dates[dates.length - 1] : '';
}

export function noticeMatch(notice, watch) {
  const watched = (watch?.cpvCodes || []).map((row) => text(row?.code || row)).filter(Boolean);
  const codes = Array.isArray(notice?.cpvCodes) ? notice.cpvCodes : [];
  const cpv = codes.filter((code) => watched.some((item) => {
    const left = String(code).replace(/\D/g, '');
    const right = String(item).replace(/\D/g, '');
    if (left.length < 2 || right.length < 2) return false;
    return left.startsWith(right.slice(0, 4)) || right.startsWith(left.slice(0, 4));
  }));
  const hay = fold([
    notice?.title,
    notice?.description,
    notice?.buyer,
    notice?.noticeType,
    ...(notice?.places || []),
  ].join(' '));
  const watchedWords = normalizeKeywords([
    ...(watch?.keywords || []),
    ...(watch?.profile?.keywords || []),
  ]);
  const keywords = watchedWords.filter((word) => hay.includes(fold(word)));
  const tagged = normalizeKeywords(notice?.matchedKeywords).filter((word) => (
    watchedWords.some((item) => fold(item) === fold(word))
  ));
  const seen = new Set();
  const words = [];
  for (const word of [...keywords, ...tagged]) {
    const key = fold(word);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return { cpv, keywords: words };
}

export function formatMatchLabel(notice, watch) {
  const found = noticeMatch(notice, watch);
  const parts = [];
  if (found.cpv.length) parts.push(found.cpv.slice(0, 2).join(', '));
  if (found.keywords.length) parts.push(found.keywords.join(', '));
  if (parts.length) return parts.join(' · ');
  const fallback = (notice?.cpvCodes || []).slice(0, 2);
  return fallback.length ? fallback.join(', ') : 'CPV-søk';
}

export function noticeInArea(notice, area) {
  if (!area?.id && !area?.name) return true;
  const ids = Array.isArray(notice?.locationIds) ? notice.locationIds : [];
  if (area.id && ids.includes(area.id)) return true;
  const name = fold(area.name);
  if (!name) return false;
  const segments = String((notice?.places || []).join(','))
    .split(/[,/;|]/)
    .map((part) => fold(part).trim())
    .filter(Boolean);
  return segments.some((part) => part === name || part.startsWith(`${name} `));
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => text(item)).filter(Boolean);
  if (value == null || value === '') return [];
  return [text(value)].filter(Boolean);
}

/** Ubehandlet treff der tilbudsfristen er passert. Aktuell og uaktuell blir stående. */
export function noticeDeadlineExpired(notice, now = new Date()) {
  const decision = notice?.decision || 'ubestemt';
  if (decision !== 'ubestemt') return false;
  return deadlineHasPassed(notice?.dossier?.submissionDeadline || notice?.deadline, now);
}

export function normalizeDoffinHit(hit) {
  const id = text(hit?.id);
  if (!id) return null;
  const buyers = Array.isArray(hit?.buyer) ? hit.buyer : [];
  const amount = Number(hit?.estimatedValue?.amount);
  return {
    id,
    title: text(hit?.heading) || 'Kunngjøring uten tittel',
    buyer: buyers.map((row) => text(row?.name)).filter(Boolean).join(', '),
    description: text(hit?.description),
    places: asList(hit?.placeOfPerformance),
    locationIds: asList(hit?.locationId),
    amount: Number.isFinite(amount) ? amount : null,
    currency: text(hit?.estimatedValue?.currencyCode) || 'NOK',
    winner: asList(hit?.awardedNames || hit?.winner).join(', '),
    profileIds: (Array.isArray(hit?.profileIds) ? hit.profileIds : []).map((row) => text(row)).filter(Boolean).slice(0, 8),
    kind: classifyNotice(hit),
    status: text(hit?.status) || 'ACTIVE',
    publishedAt: text(hit?.publicationDate) || text(hit?.issueDate),
    deadline: text(hit?.deadline),
    url: text(hit?.url) || `https://www.doffin.no/notices/${id}`,
    source: text(hit?.source) || 'doffin',
    noticeType: text(hit?.noticeType) || 'Kunngjøring av konkurranse',
    cpvCodes: asList(hit?.cpvCodes),
    matchedKeywords: normalizeKeywords(hit?.matchedKeywords),
    tedId: text(hit?.tedId),
    competitionDocsUrl: text(hit?.competitionDocsUrl),
  };
}

export function mergeTenderNotices(state, hits, fetchedAt) {
  const incoming = (Array.isArray(hits) ? hits : []).map(normalizeDoffinHit).filter(Boolean);
  const previousRows = (state.notices || []).map(normalizeNotice);
  const previousById = new Map(previousRows.map((row) => [row.id, row]));
  const previousBySig = new Map();
  for (const row of previousRows) {
    const sig = noticeSignature(row);
    if (sig && !previousBySig.has(sig)) previousBySig.set(sig, row);
  }
  const firstSync = !state.syncedAt;
  const used = new Set();
  const notices = [];
  for (const row of incoming) {
    if (row.status && row.status !== 'ACTIVE') continue;
    const kept = previousById.get(row.id) || previousBySig.get(noticeSignature(row)) || null;
    if (kept?.id) used.add(kept.id);
    const decided = isDecided(kept?.decision);
    notices.push({
      ...row,
      decision: kept?.decision || 'ubestemt',
      reviewedAt: kept?.reviewedAt || null,
      interestAt: kept?.interestAt || null,
      interest: kept?.interest || null,
      dossier: kept?.dossier || null,
      consideration: kept?.consideration || null,
      isNew: kept ? (decided ? false : !!kept.isNew) : !firstSync,
      matchedKeywords: normalizeKeywords([...(kept?.matchedKeywords || []), ...(row.matchedKeywords || [])]),
      aiFit: kept?.aiFit || row.aiFit || null,
      geo: kept?.geo || row.geo || null,
      brief: kept?.brief || null,
      excerpts: kept?.excerpts || [],
      updates: kept?.updates || [],
      awardContext: kept?.awardContext || null,
      qualification: kept?.qualification || [],
      frameworkId: kept?.frameworkId || '',
      kind: kept?.kind || row.kind || '',
      profileIds: [...new Set([...(kept?.profileIds || []), ...(row.profileIds || [])])],
    });
  }
  for (const kept of previousRows) {
    if (used.has(kept.id)) continue;
    notices.push(kept);
  }
  notices.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  return ok({
    ...state,
    notices: mergeNoticeLists(notices, []),
    syncedAt: fetchedAt || new Date().toISOString(),
  });
}

const STRATEGY_IDS = new Set(STRATEGY_ITEMS.map((item) => item.id));

function normalizeNotice(raw) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const strategy = row.consideration ? normalizeStrategy(row.consideration.strategy) : null;
  const decision = DECISIONS.has(row.decision) ? row.decision : 'ubestemt';
  return {
    ...row,
    id: text(row.id),
    decision,
    reviewedAt: row.reviewedAt || null,
    consideration: strategy ? { strategy } : null,
    reviewNotes: normalizeReviewNotes(row.reviewNotes),
    aiFit: row.aiFit && typeof row.aiFit === 'object'
      ? {
        score: Math.max(0, Math.min(10, Number(row.aiFit.score) || 0)),
        reason: text(row.aiFit.reason).slice(0, 220),
        at: text(row.aiFit.at),
      }
      : null,
    geo: row.geo && Number.isFinite(Number(row.geo.lat)) && Number.isFinite(Number(row.geo.lng))
      ? {
        lat: Number(row.geo.lat),
        lng: Number(row.geo.lng),
        label: text(row.geo.label).slice(0, 120),
        precision: text(row.geo.precision).slice(0, 20),
        source: text(row.geo.source).slice(0, 20),
      }
      : null,
    ...normalizeNoticeDesk(row),
  };
}

export function toggleConsideration(state, id, itemId) {
  const notice = noticeById(state, id);
  if (!notice) return fail(state, 'Kunngjøringen finnes ikke i lista.');
  if (notice.decision !== 'aktuell') return fail(state, 'Merk konkurransen som aktuell før du tar stilling til tilbud.');
  if (!STRATEGY_IDS.has(itemId)) return fail(state, 'Ukjent punkt i vurderingen.');
  const strategy = { ...normalizeStrategy(notice.consideration?.strategy), [itemId]: !normalizeStrategy(notice.consideration?.strategy)[itemId] };
  return ok({
    ...state,
    notices: state.notices.map((row) => (row.id === id ? { ...row, consideration: { strategy } } : row)),
  });
}

function noticeById(state, id) {
  return (state.notices || []).find((row) => row.id === id) || null;
}

export function saveNoticeReviewNotes(state, id, notes) {
  const notice = noticeById(state, id);
  if (!notice) return fail(state, 'Kunngjøringen finnes ikke i lista.');
  const reviewNotes = normalizeReviewNotes(notes);
  return ok({
    ...state,
    notices: state.notices.map((row) => (row.id === id ? { ...row, reviewNotes } : row)),
  });
}

export function setNoticeDecision(state, id, decision) {
  const notice = noticeById(state, id);
  if (!notice) return fail(state, 'Kunngjøringen finnes ikke i lista.');
  if (!DECISIONS.has(decision)) return fail(state, 'Ugyldig vurdering.');
  if (decision === 'tilbud' && notice.decision !== 'aktuell' && notice.decision !== 'tilbud') {
    return fail(state, 'Meld interesse og vurder konkurransen før det leveres tilbud.');
  }
  return ok({
    ...state,
    notices: state.notices.map((row) => (
      row.id === id
        ? {
          ...row,
          decision,
          reviewedAt: new Date().toISOString(),
          isNew: decision === 'ubestemt' ? !!row.isNew : false,
          interestAt: decision === 'aktuell' ? (row.interestAt || new Date().toISOString()) : row.interestAt,
        }
        : row
    )),
  });
}

export function attachDossier(state, id, dossier) {
  const notice = noticeById(state, id);
  if (!notice) return fail(state, 'Kunngjøringen finnes ikke i lista.');
  if (!dossier || typeof dossier !== 'object') return fail(state, 'Mangler konkurransegrunnlag.');
  return ok({
    ...state,
    notices: state.notices.map((row) => (row.id === id ? { ...row, dossier } : row)),
  });
}

export function seedDossier(notice) {
  if (!notice) return null;
  const url = text(notice.url);
  return {
    id: notice.id || '',
    title: notice.title || '',
    description: notice.description || '',
    buyer: notice.buyer || '',
    places: notice.places || [],
    submissionDeadline: notice.deadline || '',
    documentsUrl: url,
    documents: url ? [{ title: 'Kunngjøring', url }] : [],
    qa: [],
    portalFiles: [],
    cpvCodes: notice.cpvCodes || [],
    noticeUrl: url,
    fetchedAt: new Date().toISOString(),
  };
}

function cleanAssignment(input) {
  if (!input || typeof input !== 'object') return null;
  const personId = text(input.personId).slice(0, 80);
  const personName = text(input.personName).slice(0, 120);
  const unitId = text(input.unitId).slice(0, 80);
  const unitName = text(input.unitName).slice(0, 160);
  if (!personId && !personName && !unitId && !unitName) return null;
  return {
    personId,
    personName,
    unitId,
    unitName,
    unitKind: text(input.unitKind).slice(0, 40),
    companyId: text(input.companyId).slice(0, 80),
    companyName: text(input.companyName).slice(0, 160),
    updatedAt: new Date().toISOString(),
  };
}

function freshBid(notice, dossier, assignment) {
  return normalizeBidWork({
    id: `bid_${notice.id}`,
    noticeId: notice.id,
    source: 'varsling',
    originAt: notice.publishedAt || '',
    interestAt: notice.interestAt || '',
    title: notice.title,
    buyer: notice.buyer,
    phase: 'trinn2',
    stage: 'planlegging',
    strategy: normalizeStrategy(notice.consideration?.strategy),
    createdAt: new Date().toISOString(),
    dossier: dossier || notice.dossier || null,
    assignment: assignment || null,
    reviewNotes: normalizeReviewNotes(notice.reviewNotes),
    folders: [],
    files: [],
    forms: [],
    questions: [],
  });
}

function stampNoticeBid(bid, notice, assignment) {
  return normalizeBidWork({
    ...bid,
    title: notice.title,
    buyer: notice.buyer,
    dossier: notice.dossier || bid.dossier,
    strategy: normalizeStrategy(notice.consideration?.strategy || bid.strategy),
    source: bid.source && bid.source !== 'manuell' ? bid.source : 'varsling',
    originAt: bid.originAt || notice.publishedAt || '',
    interestAt: bid.interestAt || notice.interestAt || '',
    assignment: assignment ? { ...(bid.assignment || {}), ...assignment } : bid.assignment,
    reviewNotes: normalizeReviewNotes(notice.reviewNotes?.length ? notice.reviewNotes : bid.reviewNotes),
    parked: '',
  });
}

/** Tar en aktuell konkurranse inn i tilbudsarbeidet med teksten, vedleggene og spørsmålene som er publisert. */
export function ensureCurrentBid(state, id, dossier) {
  const notice = noticeById(state, id);
  if (!notice) return fail(state, 'Kunngjøringen finnes ikke i lista.');
  let next = state;
  if (notice.decision !== 'aktuell' && notice.decision !== 'tilbud') {
    const marked = setNoticeDecision(next, id, 'aktuell');
    if (!marked.ok) return marked;
    next = marked.state;
  }
  if (dossier && typeof dossier === 'object') {
    const attached = attachDossier(next, id, dossier);
    if (!attached.ok) return attached;
    next = attached.state;
  }
  const row = noticeById(next, id);
  const stored = dossier || row.dossier || null;
  const existing = (next.bids || []).find((bid) => bid.noticeId === id);
  if (existing) {
    return ok({
      ...next,
      bids: next.bids.map((bid) => (
        bid.noticeId === id
          ? { ...bid, title: row.title, buyer: row.buyer, dossier: stored || bid.dossier }
          : bid
      )),
    });
  }
  return ok({ ...next, bids: [freshBid(row, stored), ...(next.bids || [])] });
}

export function releaseUntouchedBid(state, id) {
  const bid = (state?.bids || []).find((row) => row.noticeId === id);
  if (!bid) return ok(state);
  if (bid.stage && bid.stage !== 'planlegging') return ok(state);
  if (bid.interest) return ok(state);
  if (Object.values(bid.strategy || {}).some(Boolean)) return ok(state);
  return ok({ ...state, bids: state.bids.filter((row) => row.noticeId !== id) });
}

export function workCandidates(state) {
  const taken = new Set((state?.bids || []).map((bid) => bid.noticeId));
  return (state?.notices || []).filter((row) => (
    row?.id
    && !taken.has(row.id)
    && row.decision !== 'forkastet'
    && row.decision !== 'arkiv'
    && row.decision !== 'tilbud'
  ));
}

export function registerInterest(state, id, dossier) {
  if (!state?.supplierProfile?.username) {
    return fail(state, 'Registrer innloggingsportalen under Innstillinger før interesse meldes.');
  }
  const prepared = dossier ? attachDossier(state, id, dossier) : ok(state);
  if (!prepared.ok) return prepared;
  const bid = createBidWork(prepared.state, id);
  if (!bid.ok) return bid;
  const interest = {
    username: state.supplierProfile.username,
    email: state.supplierProfile.email,
    contactName: state.supplierProfile.contactName,
    portal: state.supplierProfile.portal,
    portalUrl: state.supplierProfile.portalUrl,
    registeredAt: new Date().toISOString(),
  };
  return ok({
    ...bid.state,
    bids: bid.state.bids.map((row) => (row.noticeId === id ? { ...row, interest, dossier: dossier || row.dossier } : row)),
    notices: bid.state.notices.map((row) => (row.id === id ? { ...row, interest } : row)),
  });
}

export function createBidWork(state, id, assignment) {
  const decided = setNoticeDecision(state, id, 'tilbud');
  if (!decided.ok) return decided;
  const notice = noticeById(decided.state, id);
  const stamped = cleanAssignment(assignment);
  const existing = (decided.state.bids || []).find((bid) => bid.noticeId === id);
  if (existing) {
    return ok({
      ...decided.state,
      bids: decided.state.bids.map((bid) => (
        bid.noticeId === id ? stampNoticeBid(bid, notice, stamped) : bid
      )),
    });
  }
  return ok({
    ...decided.state,
    bids: [freshBid(notice, notice.dossier, stamped), ...(decided.state.bids || [])],
  });
}

const DESK_CLOSED = new Set(['levert', 'kontrakt', 'tapt', 'trukket']);

function bidById(state, bidId) {
  return (state?.bids || []).find((row) => row.id === bidId) || null;
}

/** Leverte og avsluttede konkurranser blir stående i 3. Tilbud. */
export function bidCanLeaveDesk(bid) {
  return !!bid?.id && !DESK_CLOSED.has(bid.stage || 'planlegging');
}

/** Kun saker som kom fra varsling eller en forespørsel har en vurdering å gå tilbake til. */
export function bidCanReturnToReview(bid) {
  return bidCanLeaveDesk(bid) && !!(bid.noticeId || bid.inquiryId);
}

function parkBid(state, bidId, parked) {
  return {
    ...state,
    bids: (state.bids || []).map((row) => (row.id === bidId ? { ...row, parked } : row)),
  };
}

/**
 * Tar saken ett steg tilbake til 2. Vurdering av aktuelle.
 * Tilbudsarbeidet beholdes, slik at filer og notater følger med om det gis tilbud igjen.
 */
export function returnBidToReview(state, bidId) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudet finnes ikke.');
  if (!bidCanLeaveDesk(bid)) {
    return fail(state, 'Leverte og avsluttede tilbud kan ikke flyttes tilbake til vurdering.');
  }
  if (!bid.noticeId && !bid.inquiryId) {
    return fail(state, 'Tilbudet er opprettet direkte og har ingen vurdering å gå tilbake til.');
  }
  let next = state;
  if (bid.noticeId) {
    const decided = setNoticeDecision(next, bid.noticeId, 'aktuell');
    if (!decided.ok) return decided;
    next = decided.state;
  }
  return ok(parkBid(next, bidId, 'vurdering'));
}

/** Melder saken som uaktuell og tar den ut av både tilbudsarbeid og vurdering. */
export function markBidUaktuell(state, bidId) {
  const bid = bidById(state, bidId);
  if (!bid) return fail(state, 'Tilbudet finnes ikke.');
  if (!bidCanLeaveDesk(bid)) {
    return fail(state, 'Leverte og avsluttede tilbud kan ikke meldes som uaktuelle.');
  }
  let next = state;
  if (bid.noticeId) {
    const decided = setNoticeDecision(next, bid.noticeId, 'forkastet');
    if (!decided.ok) return decided;
    next = decided.state;
  }
  return ok(parkBid(next, bidId, 'uaktuell'));
}

/** 3. Tilbud viser bare saker som fortsatt er i tilbudsarbeid. */
export function bidListedOnDesk(bid, notice = null) {
  if (!bid) return false;
  if (bid.parked === 'vurdering' || bid.parked === 'uaktuell') return false;
  if (bid.noticeId && notice && notice.decision !== 'tilbud') return false;
  return true;
}

/** Manuelt tilbudsarbeid uten kunngjøring fra Doffin/TED. */
export function createManualBidWork(state, input = {}) {
  const title = text(input?.title).slice(0, 200);
  if (!title) return fail(state, 'Gi tilbudet et navn.');
  const buyer = text(input?.buyer).slice(0, 160);
  const deadline = text(input?.deadline).slice(0, 80);
  const questionDeadline = text(input?.questionDeadline).slice(0, 80);
  const description = text(input?.description).slice(0, 8000);
  const inquiryId = text(input?.inquiryId).slice(0, 80);
  const source = input?.source === 'protop' ? 'protop' : 'manuell';
  const stamped = cleanAssignment(input?.assignment);
  const bids = Array.isArray(state?.bids) ? state.bids : [];
  if (inquiryId) {
    const existing = bids.find((row) => row.inquiryId === inquiryId);
    if (existing) {
      return ok({
        ...state,
        bids: bids.map((row) => (
          row.inquiryId === inquiryId
            ? normalizeBidWork({
              ...row,
              parked: '',
              assignment: stamped || row.assignment,
              reviewNotes: normalizeReviewNotes(input?.reviewNotes?.length ? input.reviewNotes : row.reviewNotes),
            })
            : row
        )),
      });
    }
  }
  const bid = normalizeBidWork({
    id: `bid_manuell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    noticeId: '',
    source,
    inquiryId,
    channel: text(input?.channel).slice(0, 40),
    originAt: text(input?.originAt).slice(0, 40),
    interestAt: text(input?.interestAt).slice(0, 40),
    title,
    buyer,
    phase: 'trinn2',
    stage: 'planlegging',
    createdAt: new Date().toISOString(),
    assignment: stamped,
    reviewNotes: normalizeReviewNotes(input?.reviewNotes),
    dossier: {
      title,
      buyer,
      description,
      submissionDeadline: deadline,
      questionDeadline,
    },
    folders: [],
    files: [],
    forms: [],
    questions: [],
  });
  if (bids.length >= 80) return fail(state, 'Bedriften har maks 80 tilbudsarbeid.');
  return ok({ ...state, bids: [bid, ...bids] });
}

export function formatNok(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '';
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(amount))} kr`;
}

export function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: iso.length > 10 ? '2-digit' : undefined,
    minute: iso.length > 10 ? '2-digit' : undefined,
  }).format(date);
}

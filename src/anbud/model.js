import { areaById, cpvByCode } from './catalog.js';
import { normalizeFormTemplates, normalizeBidWork } from './bidLibrary.js';
import { normalizeCustomers } from './customers.js';
import { deadlineHasPassed, normalizeAudit, normalizeBidRecord, normalizeContracts, normalizeStrategy, STRATEGY_ITEMS } from './lifecycle.js';

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
      nationwide: false,
      savedAt: null,
      orgnr: '',
      cpvSource: '',
      profile: normalizeWatchProfile(null),
    },
    notices: [],
    bids: [],
    contracts: [],
    customers: [],
    audit: [],
    formTemplates: null,
    supplierProfile: null,
    syncedAt: null,
    queryKey: '',
  };
}

export function normalizeAnbudState(raw) {
  const base = emptyAnbudState();
  const src = raw && typeof raw === 'object' ? raw : {};
  const watch = src.watch && typeof src.watch === 'object' ? src.watch : {};
  return {
    watch: {
      ...base.watch,
      ...watch,
      cpvCodes: Array.isArray(watch.cpvCodes) ? watch.cpvCodes : [],
      areas: Array.isArray(watch.areas) ? watch.areas : [],
      channels: normalizeChannels(watch.channels),
      notify: normalizeNotify(watch.notify),
      emails: normalizeEmails(watch.emails),
      naeringskoder: normalizeTrades(watch.naeringskoder),
      keywords: normalizeKeywords(watch.keywords),
      profile: normalizeWatchProfile(watch.profile),
    },
    notices: Array.isArray(src.notices) ? src.notices.map(normalizeNotice) : [],
    bids: (Array.isArray(src.bids) ? src.bids : []).map((row) => normalizeBidWork(normalizeBidRecord(row))),
    contracts: normalizeContracts(src.contracts),
    customers: normalizeCustomers(src.customers),
    audit: normalizeAudit(src.audit),
    formTemplates: normalizeFormTemplates(src.formTemplates),
    supplierProfile: normalizeSupplierProfile(src.supplierProfile),
    syncedAt: src.syncedAt || null,
    queryKey: text(src.queryKey),
  };
}

const DECISIONS = new Set(['ubestemt', 'aktuell', 'arkiv', 'forkastet', 'ikke', 'tilbud']);

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

function noticeKeys(row) {
  const id = text(row?.id);
  const sig = noticeSignature(row);
  return [id, sig].filter(Boolean);
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
    channels: normalizeChannels(src.channels || a.channels || b.channels),
    notify: normalizeNotify(src.notify || a.notify),
    emails: normalizeEmails(src.emails || a.emails),
    naeringskoder: normalizeTrades(src.naeringskoder || a.naeringskoder),
    keywords: normalizeKeywords(src.keywords || a.keywords),
    profile: normalizeWatchProfile(src.profile || a.profile || b.profile),
  };
}

function mergeContractFiles(left, right) {
  const merged = mergeById(left, right);
  const kept = new Map();
  for (const row of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    for (const doc of row?.documents || []) {
      if (doc?.id && (doc.dataUrl || doc.uri || doc.url)) kept.set(`${row.id}:${doc.id}`, doc);
    }
  }
  return merged.map((row) => ({
    ...row,
    documents: (row.documents || []).map((doc) => {
      const extra = kept.get(`${row.id}:${doc.id}`);
      if (!extra) return doc;
      return {
        ...doc,
        dataUrl: doc.dataUrl || extra.dataUrl || '',
        uri: doc.uri || extra.uri || '',
        url: doc.url || extra.url || '',
      };
    }),
  }));
}

/** Slår sammen to lagrede tilstander uten å nullstille vurderinger. */
export function mergeAnbudStates(left, right) {
  const a = normalizeAnbudState(left);
  const b = normalizeAnbudState(right);
  const aSync = Date.parse(a.syncedAt || '') || 0;
  const bSync = Date.parse(b.syncedAt || '') || 0;
  return normalizeAnbudState({
    watch: pickWatch(a.watch, b.watch),
    notices: mergeNoticeLists(a.notices, b.notices),
    bids: mergeById(a.bids, b.bids),
    contracts: mergeContractFiles(a.contracts, b.contracts),
    customers: mergeById(a.customers, b.customers),
    audit: aSync >= bSync ? (a.audit.length ? a.audit : b.audit) : (b.audit.length ? b.audit : a.audit),
    formTemplates: a.formTemplates || b.formTemplates,
    supplierProfile: (Date.parse(b.supplierProfile?.savedAt || '') || 0) > (Date.parse(a.supplierProfile?.savedAt || '') || 0)
      ? b.supplierProfile
      : (a.supplierProfile || b.supplierProfile),
    syncedAt: laterIso(a.syncedAt, b.syncedAt),
    queryKey: (bSync > aSync ? b.queryKey : a.queryKey) || b.queryKey || a.queryKey,
  });
}

function stripHeavy(value) {
  if (Array.isArray(value)) return value.map(stripHeavy);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'dataUrl' || key === 'base64') continue;
    out[key] = stripHeavy(item);
  }
  return out;
}

/** Fjerner tunge filinnhold slik at valg overlever lagringsgrenser. */
export function compactAnbudState(raw) {
  return stripHeavy(normalizeAnbudState(raw));
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
  if (!cpvCodes.length) return fail(state, 'Registrer minst én CPV-kode.');
  if (cpvCodes.length > 20) return fail(state, 'Maks 20 CPV-koder i ett varsel.');
  const nationwide = !!input?.nationwide;
  const areas = nationwide ? [] : normalizeAreas(input?.areas);
  if (!nationwide && !areas.length) return fail(state, 'Velg minst ett fylke, eller hele Norge.');
  return ok({
    ...state,
    watch: {
      companyName,
      cpvCodes,
      areas,
      nationwide,
      savedAt: new Date().toISOString(),
      orgnr: text(input?.orgnr).replace(/\D/g, '').slice(0, 9),
      cpvSource: text(input?.cpvSource),
      channels: normalizeChannels(input?.channels),
      notify: normalizeNotify(input?.notify),
      emails: normalizeEmails(input?.emails),
      naeringskoder: normalizeTrades(input?.naeringskoder),
      keywords: normalizeKeywords(input?.keywords),
      profile: normalizeWatchProfile(input?.profile ?? state.watch?.profile),
    },
  });
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

export function watchQuery(watch) {
  if (!watch?.companyName || !watch.cpvCodes?.length) return null;
  if (!watch.nationwide && !watch.areas?.length) return null;
  return {
    cpvCodes: watch.cpvCodes.map((row) => row.code),
    locationIds: watch.nationwide ? [] : watch.areas.map((row) => row.id),
    keywords: normalizeKeywords(watch.keywords),
  };
}

export function watchFingerprint(watch) {
  const cpv = (watch?.cpvCodes || []).map((row) => text(row?.code || row)).filter(Boolean).sort();
  const areas = watch?.nationwide ? ['*'] : (watch?.areas || []).map((row) => text(row?.id || row)).filter(Boolean).sort();
  const channels = (Array.isArray(watch?.channels) ? watch.channels : []).map((row) => text(row)).filter(Boolean).sort();
  const keywords = normalizeKeywords(watch?.keywords).map((row) => fold(row)).sort();
  return JSON.stringify({ cpv, areas, channels, keywords });
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
  const keywords = normalizeKeywords(watch?.keywords).filter((word) => hay.includes(fold(word)));
  const tagged = normalizeKeywords(notice?.matchedKeywords).filter((word) => (
    normalizeKeywords(watch?.keywords).some((item) => fold(item) === fold(word))
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
    status: text(hit?.status) || 'ACTIVE',
    publishedAt: text(hit?.publicationDate) || text(hit?.issueDate),
    deadline: text(hit?.deadline),
    url: text(hit?.url) || `https://www.doffin.no/notices/${id}`,
    source: text(hit?.source) || 'doffin',
    noticeType: text(hit?.noticeType) || 'Kunngjøring av konkurranse',
    cpvCodes: asList(hit?.cpvCodes),
    matchedKeywords: normalizeKeywords(hit?.matchedKeywords),
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
    aiFit: row.aiFit && typeof row.aiFit === 'object'
      ? {
        score: Math.max(0, Math.min(10, Number(row.aiFit.score) || 0)),
        reason: text(row.aiFit.reason).slice(0, 220),
        at: text(row.aiFit.at),
      }
      : null,
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

function freshBid(notice, dossier) {
  return normalizeBidWork({
    id: `bid_${notice.id}`,
    noticeId: notice.id,
    title: notice.title,
    buyer: notice.buyer,
    phase: 'trinn2',
    stage: 'planlegging',
    strategy: normalizeStrategy(notice.consideration?.strategy),
    createdAt: new Date().toISOString(),
    dossier: dossier || notice.dossier || null,
    folders: [],
    files: [],
    forms: [],
    questions: [],
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

export function createBidWork(state, id) {
  const decided = setNoticeDecision(state, id, 'tilbud');
  if (!decided.ok) return decided;
  const notice = noticeById(decided.state, id);
  const existing = (decided.state.bids || []).find((bid) => bid.noticeId === id);
  if (existing) {
    return ok({
      ...decided.state,
      bids: decided.state.bids.map((bid) => (
        bid.noticeId === id
          ? normalizeBidWork({
            ...bid,
            title: notice.title,
            buyer: notice.buyer,
            dossier: notice.dossier || bid.dossier,
            strategy: normalizeStrategy(notice.consideration?.strategy || bid.strategy),
          })
          : bid
      )),
    });
  }
  return ok({ ...decided.state, bids: [freshBid(notice, notice.dossier), ...(decided.state.bids || [])] });
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

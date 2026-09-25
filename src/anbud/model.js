import { areaById, cpvByCode } from './catalog.js';

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
      areas: [],
      nationwide: false,
      savedAt: null,
      orgnr: '',
      cpvSource: '',
    },
    notices: [],
    bids: [],
    supplierProfile: null,
    syncedAt: null,
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
    },
    notices: Array.isArray(src.notices) ? src.notices : [],
    bids: Array.isArray(src.bids) ? src.bids : [],
    supplierProfile: normalizeSupplierProfile(src.supplierProfile),
    syncedAt: src.syncedAt || null,
  };
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

export function watchQuery(watch) {
  if (!watch?.companyName || !watch.cpvCodes?.length) return null;
  if (!watch.nationwide && !watch.areas?.length) return null;
  return {
    cpvCodes: watch.cpvCodes.map((row) => row.code),
    locationIds: watch.nationwide ? [] : watch.areas.map((row) => row.id),
  };
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => text(item)).filter(Boolean);
  if (value == null || value === '') return [];
  return [text(value)].filter(Boolean);
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
  };
}

export function mergeTenderNotices(state, hits, fetchedAt) {
  const incoming = (Array.isArray(hits) ? hits : []).map(normalizeDoffinHit).filter(Boolean);
  const byId = new Map();
  for (const row of incoming) {
    if (row.status && row.status !== 'ACTIVE') continue;
    byId.set(row.id, row);
  }
  const previous = new Map((state.notices || []).map((row) => [row.id, row]));
  const firstSync = !state.syncedAt;
  const notices = [...byId.values()]
    .map((row) => {
      const kept = previous.get(row.id);
      return {
        ...row,
        decision: kept?.decision || 'ubestemt',
        interestAt: kept?.interestAt || null,
        dossier: kept?.dossier || null,
        isNew: !firstSync && !previous.has(row.id),
      };
    })
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  for (const [id, kept] of previous) {
    if (byId.has(id)) continue;
    notices.push({ ...kept, isNew: false });
  }
  return ok({
    ...state,
    notices,
    syncedAt: fetchedAt || new Date().toISOString(),
  });
}

const DECISIONS = new Set(['ubestemt', 'aktuell', 'arkiv', 'forkastet', 'tilbud']);

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

export function registerInterest(state, id, dossier) {
  if (!state?.supplierProfile?.username) {
    return fail(state, 'Registrer bedriftens innloggingsprofil i trinn 2 før interesse meldes.');
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
  if ((decided.state.bids || []).some((bid) => bid.noticeId === id)) return decided;
  const bid = {
    id: `bid_${id}`,
    noticeId: id,
    title: notice.title,
    buyer: notice.buyer,
    phase: 'trinn2',
    createdAt: new Date().toISOString(),
    dossier: notice.dossier || null,
  };
  return ok({ ...decided.state, bids: [bid, ...(decided.state.bids || [])] });
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

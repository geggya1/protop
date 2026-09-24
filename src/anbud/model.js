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
  if (digits.length < 2 || digits.length > 8) return '';
  return digits.padEnd(8, '0');
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
    },
    notices: [],
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
    },
    notices: Array.isArray(src.notices) ? src.notices : [],
    syncedAt: src.syncedAt || null,
  };
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
    },
  });
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
    url: `https://www.doffin.no/notices/${id}`,
  };
}

export function mergeTenderNotices(state, hits, fetchedAt) {
  const incoming = (Array.isArray(hits) ? hits : []).map(normalizeDoffinHit).filter(Boolean);
  const byId = new Map();
  for (const row of incoming) {
    if (row.status && row.status !== 'ACTIVE') continue;
    byId.set(row.id, row);
  }
  const previousIds = new Set((state.notices || []).map((row) => row.id));
  const firstSync = !state.syncedAt;
  const notices = [...byId.values()]
    .map((row) => ({ ...row, isNew: !firstSync && !previousIds.has(row.id) }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return ok({
    ...state,
    notices,
    syncedAt: fetchedAt || new Date().toISOString(),
  });
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

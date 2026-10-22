import AsyncStorage from '@react-native-async-storage/async-storage';

const CASES = 'protop.indeksregulering.cases.v1';
const CACHE = 'protop.indeksregulering.ssb.v1';

/** Saker hører til ett selskap. Uten selskap finnes ingen saker. */
function casesKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${CASES}.${id}` : '';
}

export async function loadCases(companyId) {
  const key = casesKey(companyId);
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCases(cases, companyId) {
  const key = casesKey(companyId);
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify(cases.slice(0, 40)));
  // Den gamle felles listen kan høre til et annet selskap.
  try { await AsyncStorage.removeItem(CASES); } catch { /* valgfritt */ }
}

export async function loadIndexCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.series) return null;
    return parsed;
  } catch {
    return null;
  }
}

const CACHE_BYTES = 900_000;

function pointYear(period) {
  const match = /^(\d{4})/.exec(String(period || ''));
  return match ? Number(match[1]) : 0;
}

function slimPoints(points, minYear) {
  const rows = (Array.isArray(points) ? points : [])
    .map((point) => ({ period: String(point?.period || ''), value: Number(point?.value) }))
    .filter((point) => point.period && Number.isFinite(point.value));
  const kept = minYear ? rows.filter((point) => pointYear(point.period) >= minYear) : rows;
  return kept.length ? kept : rows.slice(-12);
}

export function slimIndexCache(bundle, { minYear = 0, historyLimit = 40 } = {}) {
  const series = {};
  Object.entries(bundle?.series || {}).forEach(([id, row]) => {
    if (!row) return;
    const points = slimPoints(row.points, minYear);
    const latest = row.latest?.period
      ? { period: String(row.latest.period), value: Number(row.latest.value) }
      : (points.at(-1) || null);
    series[id] = {
      id,
      name: row.name || '',
      table: row.table || '',
      codes: Array.isArray(row.codes) ? row.codes.slice(0, 6) : [],
      basis: row.basis || '',
      frequency: row.frequency || '',
      group: row.group || '',
      points,
      latest,
    };
  });
  return {
    fetchedAt: bundle?.fetchedAt || '',
    checkedOn: bundle?.checkedOn || '',
    news: Array.isArray(bundle?.news) ? bundle.news.slice(0, 20) : [],
    history: Array.isArray(bundle?.history) ? bundle.history.slice(-historyLimit) : [],
    errors: Array.isArray(bundle?.errors) ? bundle.errors.slice(0, 5) : [],
    series,
  };
}

export function indexCachePayloads(bundle, now = new Date()) {
  const year = now.getFullYear();
  return [
    slimIndexCache(bundle, { minYear: 0, historyLimit: 40 }),
    slimIndexCache(bundle, { minYear: year - 12, historyLimit: 20 }),
    slimIndexCache(bundle, { minYear: year - 5, historyLimit: 8 }),
  ];
}

export async function saveIndexCache(bundle, storage = AsyncStorage) {
  let lastError = null;
  for (const slim of indexCachePayloads(bundle)) {
    const payload = JSON.stringify(slim);
    if (payload.length > CACHE_BYTES) continue;
    try {
      await storage.setItem(CACHE, payload);
      return { ok: true, bytes: payload.length };
    } catch (error) {
      lastError = error;
      try { await storage.removeItem(CACHE); } catch { /* den gamle cachen får ikke plass */ }
    }
  }
  return { ok: false, error: String(lastError?.message || 'Kunne ikke lagre indekscachen.') };
}

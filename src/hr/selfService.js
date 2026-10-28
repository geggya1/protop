/**
 * «Min side» i HR: hver ansatt leser sitt eget utsnitt i families/{id}/hrSelf/{ansatt-id}.
 * HR-dokumentet (hr/state) med lønn, saker, memo og søkere kan bare leses av dem med
 * HR-tilgang. Utsnittet skrives av HR når HR lagres, og fylles første gang HR åpnes for
 * data som fantes fra før. Det inneholder bare det som er delt med personen selv.
 *
 * Ren modul – brukes av storage.js og tester. Lønn og HR-data lagres ikke på enheten
 * (hrStateForDevice).
 */
import { employeeVisibleSlice, normalizeHrState } from './model.js';

export const HR_SELF_KEYS = ['contracts', 'reviews', 'cases', 'memos', 'tasks', 'salaries', 'files', 'hmsCards'];

// Lønn i avtalen (AML § 14-6) følger lønnen: ikke på enheten.
const CONTRACT_PAY_KEYS = ['salaryAmount', 'salaryExtras'];

function text(value) {
  return String(value ?? '').trim();
}

/** Ansatte som har minst én rad i HR (avtale, lønn, sak, memo, oppgave, fil eller HMS-kort). */
export function hrEmployeeIds(state) {
  const src = normalizeHrState(state);
  const ids = new Set();
  for (const key of HR_SELF_KEYS) {
    for (const row of src[key] || []) {
      const id = text(row?.employeeId);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Utsnittet én ansatt får se: samme regler som employeeVisibleSlice. */
export function hrSelfDoc(state, employeeId) {
  const id = text(employeeId);
  return { employeeId: id, ...employeeVisibleSlice(state, id) };
}

/** Lest fra skyen (eller fra HR-dokumentet): alltid samme form som employeeVisibleSlice. */
export function hrSelfSlice(data, employeeId) {
  return employeeVisibleSlice(data && typeof data === 'object' ? data : {}, employeeId);
}

function hasContent(row) {
  return HR_SELF_KEYS.some((key) => Array.isArray(row?.[key]) && row[key].length > 0);
}

// Firestore gir ikke feltene i samme rekkefølge som de ble skrevet. Sammenlign uten rekkefølge.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function sameSlice(a, b) {
  const pick = (row) => HR_SELF_KEYS.map((key) => (Array.isArray(row?.[key]) ? row[key] : []));
  return JSON.stringify(stable(pick(a))) === JSON.stringify(stable(pick(b)));
}

/**
 * Utsnittene som må skrives. existing: { [ansatt-id]: utsnitt } slik de står i skyen (eller
 * slik de ble regnet ut av forrige versjon). En ansatt som ikke lenger har noe delt, får et
 * tomt utsnitt, så ingenting gammelt blir stående.
 */
export function planHrSelf({ state, existing = {} } = {}) {
  const before = existing && typeof existing === 'object' ? existing : {};
  const ids = new Set([...hrEmployeeIds(state), ...Object.keys(before)]);
  const write = [];
  for (const id of ids) {
    if (!id) continue;
    const next = hrSelfDoc(state, id);
    const old = before[id];
    if (!old && !hasContent(next)) continue;
    if (old && sameSlice(hrSelfSlice(old, id), next)) continue;
    write.push(next);
  }
  return write;
}

/** Utsnittene regnet ut av en HR-versjon (for å se hva en lagring endrer). */
export function hrSelfDocs(state) {
  const out = {};
  for (const id of hrEmployeeIds(state)) out[id] = hrSelfDoc(state, id);
  return out;
}

/** Kopien på enheten: uten lønn (lønnslisten og lønn i avtalene). */
export function hrStateForDevice(state) {
  const src = normalizeHrState(state);
  return {
    ...src,
    salaries: [],
    contracts: src.contracts.map((row) => {
      const next = { ...row };
      for (const key of CONTRACT_PAY_KEYS) next[key] = '';
      return next;
    }),
  };
}

/** Lokal kopi (uten lønn) som er nyere enn skyen: lønnen hentes fra skyen. */
export function withCloudPay(local, remote) {
  const src = normalizeHrState(local);
  const cloud = normalizeHrState(remote);
  const byId = new Map(cloud.contracts.map((row) => [row.id, row]));
  return normalizeHrState({
    ...src,
    salaries: src.salaries.length ? src.salaries : cloud.salaries,
    contracts: src.contracts.map((row) => {
      const fresh = byId.get(row.id);
      if (!fresh) return row;
      const next = { ...row };
      for (const key of CONTRACT_PAY_KEYS) {
        if (!text(next[key])) next[key] = fresh[key];
      }
      return next;
    }),
  });
}
